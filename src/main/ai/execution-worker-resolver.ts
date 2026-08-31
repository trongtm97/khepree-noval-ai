import type { DatabaseManager } from '../db/database-manager';
import {
  isBrowserAiAccountProvider,
  type AiProviderType,
} from '@shared/constants/ai-provider';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { getBrowserRuntimeManager } from '../automation/browser-runner/browser-runtime-manager';
import { runtimeLockOwner } from '@shared/constants/browser-runtime';
import { healIdleWorkers } from '../jobs/heal-workers';
import { resolvePrimaryProviderId } from './primary-provider-policy';
import type { AiRoutingMode } from '@shared/constants/provider-preflight';
import { AI_ROUTING_META_KEYS } from '@shared/constants/provider-preflight';
import { AI_FALLBACK_META_KEYS } from '@shared/constants/ai-provider';
import { workerProcessManager } from './worker-process-manager';
import {
  type AiExecutionTarget,
  buildExecutionWorkerId,
  defaultCapabilitiesForProviderType,
  GOOGLE_GEMINI_PROVIDER_ID,
} from './execution-target';
import { logger } from '../logging/logger';

export interface ListAvailableTargetsOptions {
  projectId?: string | null;
  preferredProviderId?: string | null;
  /** Account ids already running a job — exclude from READY set. */
  busyAccountIds?: ReadonlySet<string>;
  routingMode?: AiRoutingMode;
}

export class AiExecutionWorkerResolver {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * List schedulable execution targets from Google accounts + ai_accounts.
   * Does not require Google accounts for ChatGPT/Meta/WebAPI paths.
   */
  listAvailableTargets(
    options: ListAvailableTargetsOptions = {},
  ): AiExecutionTarget[] {
    this.db.workerStates.clearExpiredLimits();
    healIdleWorkers(this.db);

    const busy = options.busyAccountIds ?? new Set<string>();
    const now = Date.now();
    const targets: AiExecutionTarget[] = [];

    targets.push(...this.listGoogleGeminiTargets(busy, now));
    targets.push(...this.listAiAccountTargets(busy, now));

    return this.sortTargetsForProject(targets, options);
  }

  getTargetByWorkerId(workerId: string): AiExecutionTarget | null {
    const parsed = workerId.includes(':')
      ? { providerId: workerId.slice(0, workerId.indexOf(':')), accountId: workerId.slice(workerId.indexOf(':') + 1) }
      : null;
    if (!parsed) return null;

    const all = this.listAvailableTargets({});
    const found = all.find((t) => t.workerId === workerId);
    if (found) return found;

    // Include BUSY / non-ready for recovery lookups
    if (parsed.providerId === GOOGLE_GEMINI_PROVIDER_ID) {
      const worker = this.db.workerStates.getByAccountId(parsed.accountId);
      const account = this.db.googleAccounts.getById(parsed.accountId);
      if (worker && account) {
        const profile = this.db.googleAccounts.getProfile(parsed.accountId);
        return this.googleTargetFromWorker(worker, account.status, profile?.profile_dir_name ?? null);
      }
    }

    const aiAccount = this.db.aiAccounts.getById(parsed.accountId);
    if (aiAccount && aiAccount.provider_id === parsed.providerId) {
      const row = this.db.aiProviders.getById(parsed.providerId);
      if (row) {
        return this.aiAccountTarget(aiAccount, row.type as AiProviderType);
      }
    }
    return null;
  }

  private listGoogleGeminiTargets(
    busy: ReadonlySet<string>,
    now: number,
  ): AiExecutionTarget[] {
    const out: AiExecutionTarget[] = [];
    for (const w of this.db.workerStates.listEnabled()) {
      if (w.health === 'DISABLED' || w.health === 'OFFLINE') continue;
      if (w.health === 'NEEDS_ATTENTION') continue;
      if (w.health === 'BUSY') continue;
      if (w.health === 'LIMITED') {
        if (w.limited_until && Date.parse(w.limited_until) > now) continue;
      } else if (w.health !== 'READY') {
        continue;
      }

      const account = this.db.googleAccounts.getById(w.google_account_id);
      if (!account || account.status === 'DISABLED') continue;
      if (account.status === 'NEEDS_ATTENTION' || account.status === 'LOGIN_REQUIRED') {
        continue;
      }
      if (busy.has(w.google_account_id)) continue;

      const profile = this.db.googleAccounts.getProfile(w.google_account_id);
      if (!profile?.profile_dir_name) continue;

      const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
      if (!this.profileAvailable(w.google_account_id, profilePath, w.current_job_id)) {
        continue;
      }

      out.push(this.googleTargetFromWorker(w, account.status, profile.profile_dir_name));
    }
    return out;
  }

  private googleTargetFromWorker(
    w: { id: string; google_account_id: string; health: string },
    accountStatus: string,
    profileDirName: string | null,
  ): AiExecutionTarget {
    const status = mapAccountStatus(accountStatus, w.health);
    return {
      workerId: buildExecutionWorkerId(GOOGLE_GEMINI_PROVIDER_ID, w.google_account_id),
      providerId: GOOGLE_GEMINI_PROVIDER_ID,
      providerType: 'PLAYWRIGHT_GEMINI',
      accountKind: 'GOOGLE_ACCOUNT',
      accountId: w.google_account_id,
      profileDirName,
      concurrencyKey: w.google_account_id,
      status,
      capabilities: defaultCapabilitiesForProviderType('PLAYWRIGHT_GEMINI'),
      legacyWorkerStateId: w.id,
    };
  }

  private listAiAccountTargets(
    busy: ReadonlySet<string>,
    _now: number,
  ): AiExecutionTarget[] {
    const out: AiExecutionTarget[] = [];
    const providerRows = this.db.aiProviders.listEnabledOrdered();

    for (const prov of providerRows) {
      const providerType = prov.type as AiProviderType;
      if (providerType === 'PLAYWRIGHT_GEMINI') continue;

      const readyAccounts = this.db.aiAccounts.listReadyByProvider(prov.id);
      for (const account of readyAccounts) {
        if (busy.has(account.id)) continue;

        if (isBrowserAiAccountProvider(providerType)) {
          if (!account.profile_dir_name) continue;
          if (!browserProfileManager.profileExists(account.profile_dir_name)) continue;
          const profilePath = browserProfileManager.resolveProfilePath(
            account.profile_dir_name,
          );
          if (!this.profileAvailable(account.id, profilePath, null)) continue;
        }

        if (providerType === 'GEMINI_WEB_API') {
          const install = workerProcessManager.detectInstall();
          if (!install.ok) continue;
        }

        out.push(this.aiAccountTarget(account, providerType));
      }
    }
    return out;
  }

  private aiAccountTarget(
    account: {
      id: string;
      provider_id: string;
      profile_dir_name: string | null;
      status: string;
    },
    providerType: AiProviderType,
  ): AiExecutionTarget {
    return {
      workerId: buildExecutionWorkerId(account.provider_id, account.id),
      providerId: account.provider_id,
      providerType,
      accountKind: 'AI_ACCOUNT',
      accountId: account.id,
      profileDirName: account.profile_dir_name,
      concurrencyKey: account.id,
      status: mapAccountStatus(account.status, 'READY'),
      capabilities: defaultCapabilitiesForProviderType(providerType),
      legacyWorkerStateId: null,
    };
  }

  private profileAvailable(
    accountId: string,
    profilePath: string,
    currentJobId: string | null,
  ): boolean {
    const lockOwner = profileLockManager.getOwner(profilePath);
    if (lockOwner) {
      if (lockOwner === runtimeLockOwner(accountId)) {
        // runtime lock for same account — ok
      } else if (lockOwner.startsWith('job:')) {
        logger.info('Execution target skipped — profile held by job', { accountId });
        return false;
      } else {
        profileLockManager.recoverIfStale(profilePath);
        if (profileLockManager.isLocked(profilePath)) {
          return false;
        }
      }
    }
    const runtime = getBrowserRuntimeManager().getRuntime(accountId);
    if (runtime?.health === 'BUSY' || runtime?.health === 'NEEDS_ATTENTION') {
      return false;
    }
    void currentJobId;
    return true;
  }

  private sortTargetsForProject(
    targets: AiExecutionTarget[],
    options: ListAvailableTargetsOptions,
  ): AiExecutionTarget[] {
    const mode =
      options.routingMode ??
      (this.db.appMeta.get(AI_ROUTING_META_KEYS.mode) === 'PIN' ? 'PIN' : 'AUTO');

    let preferred =
      options.preferredProviderId ??
      (options.projectId ? resolvePrimaryProviderId(this.db, options.projectId) : null);

    if (mode === 'PIN') {
      const pinned = this.db.appMeta.get(AI_ROUTING_META_KEYS.pinnedProviderId);
      if (pinned) preferred = pinned;
    }

    const fallbackEnabled = this.db.appMeta.get(AI_FALLBACK_META_KEYS.enabled) !== '0';

    let filtered = targets.filter((t) => t.status === 'READY');
    if (preferred && mode === 'PIN') {
      filtered = filtered.filter((t) => t.providerId === preferred);
    } else if (preferred && !fallbackEnabled) {
      const preferredTargets = filtered.filter((t) => t.providerId === preferred);
      if (preferredTargets.length > 0) filtered = preferredTargets;
    }

    return [...filtered].sort((a, b) => {
      const prefA = preferred && a.providerId === preferred ? 0 : 1;
      const prefB = preferred && b.providerId === preferred ? 0 : 1;
      if (prefA !== prefB) return prefA - prefB;

      const provA = this.db.aiProviders.getById(a.providerId)?.priority ?? 999;
      const provB = this.db.aiProviders.getById(b.providerId)?.priority ?? 999;
      if (provA !== provB) return provA - provB;

      return a.accountId.localeCompare(b.accountId);
    });
  }
}

function mapAccountStatus(
  accountStatus: string,
  workerHealth: string,
): AiExecutionTarget['status'] {
  const s = accountStatus.toUpperCase();
  if (s === 'BUSY' || workerHealth === 'BUSY') return 'BUSY';
  if (s === 'LOGIN_REQUIRED') return 'LOGIN_REQUIRED';
  if (s === 'NEEDS_ATTENTION') return 'NEEDS_ATTENTION';
  if (s === 'LIMITED' || workerHealth === 'LIMITED') return 'LIMITED';
  if (s === 'DISABLED') return 'PAUSED';
  return 'READY';
}
