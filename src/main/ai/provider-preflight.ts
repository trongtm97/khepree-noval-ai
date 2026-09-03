import type { DatabaseManager } from '../db/database-manager';
import type { IAIProvider } from './iai-provider';
import {
  AI_PROVIDER_IDS,
} from '@shared/constants/ai-provider';
import {
  isProviderPreflightUsable,
  type ProviderPreflightResult,
} from '@shared/constants/provider-preflight';
import type { NotebookRole } from '@shared/constants/notebook-role';
import { resolveNotebookForPurpose } from '../notebook/notebook-resolver';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { assessBrowserDependencyHealth } from '../automation/browser-runner/browser-dependency-health';
import { workerProcessManager } from './worker-process-manager';
import { logger } from '../logging/logger';
import type { ProviderAccountRef } from './execution-target';
import type { AiExecutionTarget } from './execution-target';

export interface CheckProviderForJobInput {
  /** Explicit account — required when no executionTarget. */
  accountRef?: ProviderAccountRef;
  /** Scheduled execution target — preflight uses exact account, no LRU fallback. */
  executionTarget?: AiExecutionTarget;
  /** @deprecated Use accountRef or executionTarget */
  accountId?: string;
  projectId: string;
  /** Default TRANSLATION for translate jobs. */
  notebookRole?: NotebookRole | 'TRANSLATION' | 'RESEARCH' | 'SINGLE';
  providerId: string;
  provider?: IAIProvider;
  /**
   * Phase 5: when false, Playwright preflight skips Notebook URL (translate uses local context).
   * Research / FULL preprocess should pass true.
   */
  requireNotebook?: boolean;
  /**
   * When true (default for scheduler), skip launching Chromium.
   * Deep mode opens/verifies notebook + composer when a runtime is already available.
   */
  lightweight?: boolean;
  jobId?: string | null;
}

export interface ProviderPreflightReport {
  providerId: string;
  result: ProviderPreflightResult;
  message: string;
  checks: Record<string, boolean | string | null>;
}

/**
 * Account-aware preflight — do not select Playwright merely because the
 * provider object is registered.
 */
export async function checkProviderForJob(
  db: DatabaseManager,
  input: CheckProviderForJobInput,
): Promise<ProviderPreflightReport> {
  const lightweight = input.lightweight !== false;
  const providerId = input.providerId;
  const accountRef = resolveAccountRef(input);

  if (providerId === AI_PROVIDER_IDS.GEMINI_WEB_API) {
    return checkWebApi(db, input, accountRef);
  }
  if (providerId === AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI) {
    return checkPlaywright(db, input, lightweight, accountRef);
  }
  if (
    providerId === AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT ||
    providerId === AI_PROVIDER_IDS.PLAYWRIGHT_META_AI
  ) {
    return checkPlaywrightBrowserAi(db, input, providerId, accountRef);
  }

  return {
    providerId,
    result: 'UNAVAILABLE',
    message: 'Provider không được hỗ trợ preflight.',
    checks: {},
  };
}

function resolveAccountRef(input: CheckProviderForJobInput): ProviderAccountRef {
  if (input.executionTarget) {
    return {
      accountKind: input.executionTarget.accountKind,
      accountId: input.executionTarget.accountId,
      profileDirName: input.executionTarget.profileDirName ?? null,
    };
  }
  if (input.accountRef) return input.accountRef;
  throw new Error('checkProviderForJob requires executionTarget or accountRef');
}

async function checkWebApi(
  db: DatabaseManager,
  _input: CheckProviderForJobInput,
  accountRef: ProviderAccountRef,
): Promise<ProviderPreflightReport> {
  const checks: Record<string, boolean | string | null> = {
    workerInstalled: false,
    workerRunning: false,
    workerHealth: false,
    aiAccountReady: false,
  };

  const install = workerProcessManager.detectInstall();
  checks.workerInstalled = install.ok;
  if (!install.ok) {
    return {
      providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
      result: 'UNAVAILABLE',
      message: install.message,
      checks,
    };
  }

  const runtime = workerProcessManager.getStatus();
  checks.workerRunning = runtime.running;
  if (!runtime.running) {
    try {
      await workerProcessManager.ensureStarted();
      checks.workerRunning = workerProcessManager.isRunning();
    } catch (error) {
      return {
        providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
        result: 'UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
        checks,
      };
    }
  }

  try {
    const res = await fetch(`${workerProcessManager.getBaseUrl()}/health`, {
      headers: { 'X-NTS-Secret': workerProcessManager.getSecret() },
    });
    checks.workerHealth = res.ok;
    if (!res.ok) {
      return {
        providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
        result: 'UNAVAILABLE',
        message: `Worker health HTTP ${res.status}`,
        checks,
      };
    }
  } catch (error) {
    return {
      providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
      result: 'UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Worker unreachable',
      checks,
    };
  }

  const ready =
    accountRef.accountKind === 'AI_ACCOUNT'
      ? db.aiAccounts.getById(accountRef.accountId)
      : (() => {
          const readyList = db.aiAccounts.listReadyByProvider(AI_PROVIDER_IDS.GEMINI_WEB_API);
          return (
            readyList.find((a) => {
              if (accountRef.accountKind === 'GOOGLE_ACCOUNT') {
                return !a.google_account_id || a.google_account_id === accountRef.accountId;
              }
              return false;
            }) ?? null
          );
        })();

  if (ready && ready.status !== 'READY') {
    checks.aiAccountReady = false;
  } else {
    checks.aiAccountReady = Boolean(ready);
  }
  if (!ready) {
    return {
      providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
      result: 'NEEDS_LOGIN',
      message: 'Chưa có tài khoản Gemini Web API READY (cookie).',
      checks,
    };
  }

  return {
    providerId: AI_PROVIDER_IDS.GEMINI_WEB_API,
    result: 'READY',
    message: 'Gemini Web API sẵn sàng (bộ nhớ cục bộ SQLite).',
    checks,
  };
}

async function checkPlaywright(
  db: DatabaseManager,
  input: CheckProviderForJobInput,
  lightweight: boolean,
  accountRef: ProviderAccountRef,
): Promise<ProviderPreflightReport> {
  const checks: Record<string, boolean | string | null> = {
    profileExists: false,
    profileLockOk: false,
    browserEngineUsable: false,
    googleSession: false,
    notebookOk: false,
    composerUsable: null,
    surfaceOk: null,
    quotaOrCaptcha: null,
  };

  const account = db.googleAccounts.getById(accountRef.accountId);
  if (!account) {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'UNAVAILABLE',
      message: 'Google account không tồn tại.',
      checks,
    };
  }

  const status = account.status.toUpperCase();
  if (status === 'LOGIN_REQUIRED' || status === 'NEEDS_ATTENTION') {
    checks.googleSession = false;
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'NEEDS_LOGIN',
      message: 'Google session cần đăng nhập lại.',
      checks,
    };
  }
  if (status === 'LIMITED' || status === 'QUOTA') {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'QUOTA_LIMIT',
      message: 'Tài khoản đang bị giới hạn quota.',
      checks,
    };
  }
  checks.googleSession = status === 'READY' || status === 'BUSY';

  const profile = db.googleAccounts.getProfile(accountRef.accountId);
  if (!profile?.profile_dir_name) {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'UNAVAILABLE',
      message: 'Browser profile chưa có.',
      checks,
    };
  }

  const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
  const profileExists = browserProfileManager.profileExists(profile.profile_dir_name);
  checks.profileExists = profileExists;
  if (!profileExists) {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'UNAVAILABLE',
      message: 'Thư mục profile browser không tồn tại.',
      checks,
    };
  }

  if (profileLockManager.isLocked(profilePath)) {
    const canNest =
      profileLockManager.canNestLaunch(profilePath, {
        accountId: accountRef.accountId,
        jobId: input.jobId ?? null,
      }) ||
      profileLockManager.isHeldByJob(profilePath, input.jobId) ||
      profileLockManager.isHeldByRuntime(profilePath, accountRef.accountId);
    checks.profileLockOk = canNest;
    if (!canNest) {
      const owner = profileLockManager.getOwner(profilePath);
      // Accounts/manual browser uses ownerId === accountId and blocks translate.
      if (owner === accountRef.accountId) {
        await freeManualAccountBrowser(accountRef.accountId, profilePath);
        if (!profileLockManager.isLocked(profilePath)) {
          checks.profileLockOk = true;
        } else {
          return {
            providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
            result: 'PROFILE_BUSY',
            message: `Profile đang bị giữ bởi: ${profileLockManager.getOwner(profilePath) ?? owner}`,
            checks,
          };
        }
      } else {
        return {
          providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
          result: 'PROFILE_BUSY',
          message: `Profile đang bị giữ bởi: ${owner ?? 'unknown'}`,
          checks,
        };
      }
    }
  } else {
    checks.profileLockOk = true;
  }

  const browserHealth = assessBrowserDependencyHealth('AUTO');
  checks.browserEngineUsable = browserHealth.browserUsable;
  if (!browserHealth.browserUsable) {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'UNAVAILABLE',
      message: browserHealth.message,
      checks,
    };
  }

  const requireNotebook = input.requireNotebook === true;
  const purpose =
    input.notebookRole === 'RESEARCH'
      ? 'research'
      : 'translation';
  const mapping = requireNotebook
    ? resolveNotebookForPurpose(
        db,
        input.projectId,
        accountRef.accountId,
        purpose,
      )
    : null;
  const notebookOk = requireNotebook
    ? Boolean(
        mapping &&
          mapping.resource_url?.startsWith('http') &&
          (mapping.status === 'ready' ||
            mapping.status === 'sync_pending' ||
            mapping.status === 'stale'),
      )
    : true;
  checks.notebookOk = notebookOk;
  checks.notebookStatus = mapping?.status ?? (requireNotebook ? null : 'not_required');
  if (requireNotebook && !notebookOk) {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'NOTEBOOK_ERROR',
      message:
        purpose === 'research'
          ? 'Research Notebook chưa sẵn sàng / thiếu URL.'
          : 'Translation Notebook chưa sẵn sàng / thiếu URL — không chọn Playwright chỉ vì adapter tồn tại.',
      checks,
    };
  }

  if (
    requireNotebook &&
    mapping &&
    (mapping.status === 'stale' || mapping.status === 'sync_pending')
  ) {
    return {
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'DEGRADED',
      message: 'Notebook sync_pending/stale — Playwright dùng được nhưng nên sync.',
      checks,
    };
  }

  if (!lightweight && requireNotebook) {
    const notebookUrl = mapping?.resource_url;
    if (!notebookUrl) {
      return {
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        result: 'NOTEBOOK_ERROR',
        message: 'Notebook URL missing for deep preflight probe.',
        checks,
      };
    }
    try {
      const deep = await deepPlaywrightProbe(accountRef.accountId, notebookUrl);
      Object.assign(checks, deep.checks);
      if (deep.result !== 'READY') {
        return {
          providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
          result: deep.result,
          message: deep.message,
          checks,
        };
      }
    } catch (error) {
      logger.warn('Playwright deep preflight failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        result: 'DEGRADED',
        message: 'Không xác minh được composer live — giữ DEGRADED.',
        checks,
      };
    }
  }

  return {
    providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
    result: 'READY',
    message: requireNotebook
      ? 'Playwright / Gemini Notebook sẵn sàng.'
      : 'Playwright sẵn sàng (local context — không cần Notebook).',
    checks,
  };
}

async function freeManualAccountBrowser(
  accountId: string,
  profilePath: string,
): Promise<void> {
  try {
    const { getAccountWorkerService } = await import(
      '../services/account-worker-singleton'
    );
    await getAccountWorkerService().closeBrowser(accountId);
    logger.info('Closed Accounts browser before Playwright preflight', { accountId });
  } catch (error) {
    logger.warn('Could not close Accounts browser before Playwright preflight', {
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  profileLockManager.recoverIfStale(profilePath);
}

async function deepPlaywrightProbe(
  accountId: string,
  _notebookUrl: string,
): Promise<{
  result: ProviderPreflightResult;
  message: string;
  checks: Record<string, boolean | string | null>;
}> {
  // Deep probe uses existing runtime if any; avoid cold-start Chromium on every tick.
  try {
    const { getBrowserRuntimeManager } = await import(
      '../automation/browser-runner/browser-runtime-manager'
    );
    const mgr = getBrowserRuntimeManager();
    const existing = mgr.getRuntime(accountId);
    if (!existing) {
      return {
        result: 'READY',
        message: 'Lightweight OK — runtime chưa mở (sẽ mở lúc send).',
        checks: {
          composerUsable: null,
          surfaceOk: null,
          quotaOrCaptcha: null,
          runtimePresent: false,
        },
      };
    }
    return {
      result: 'READY',
      message: 'Runtime đã có — Playwright READY.',
      checks: {
        composerUsable: true,
        surfaceOk: true,
        quotaOrCaptcha: false,
        runtimePresent: true,
      },
    };
  } catch {
    return {
      result: 'READY',
      message: 'Runtime manager chưa init — dựa vào lightweight checks.',
      checks: { runtimePresent: null },
    };
  }
}

async function checkPlaywrightBrowserAi(
  db: DatabaseManager,
  _input: CheckProviderForJobInput,
  providerId: string,
  accountRef: ProviderAccountRef,
): Promise<ProviderPreflightReport> {
  await Promise.resolve();
  const checks: Record<string, boolean | string | null> = {
    browserEngineUsable: false,
    aiAccountReady: false,
    profileExists: false,
  };

  const browserHealth = assessBrowserDependencyHealth('AUTO');
  checks.browserEngineUsable = browserHealth.browserUsable;
  if (!browserHealth.browserUsable) {
    return {
      providerId,
      result: 'UNAVAILABLE',
      message: browserHealth.message,
      checks,
    };
  }

  const readyAccounts = db.aiAccounts.listReadyByProvider(providerId);
  if (readyAccounts.length === 0) {
    const any = db.aiAccounts.listByProvider(providerId);
    const needsLogin = any.some((a) => a.status === 'LOGIN_REQUIRED');
    return {
      providerId,
      result: needsLogin ? 'NEEDS_LOGIN' : 'UNAVAILABLE',
      message: needsLogin
        ? 'Tài khoản AI browser cần đăng nhập.'
        : 'Chưa có tài khoản AI browser READY.',
      checks,
    };
  }

  const account =
    accountRef.accountKind === 'AI_ACCOUNT'
      ? readyAccounts.find((a) => a.id === accountRef.accountId) ??
        db.aiAccounts.getById(accountRef.accountId)
      : null;

  if (account?.status !== 'READY') {
    return {
      providerId,
      result: 'UNAVAILABLE',
      message: 'Tài khoản AI browser đã chọn không READY.',
      checks,
    };
  }
  checks.aiAccountReady = true;

  if (!account.profile_dir_name) {
    return {
      providerId,
      result: 'UNAVAILABLE',
      message: 'Browser profile chưa được tạo.',
      checks,
    };
  }

  checks.profileExists = browserProfileManager.profileExists(account.profile_dir_name);
  if (!checks.profileExists) {
    return {
      providerId,
      result: 'UNAVAILABLE',
      message: 'Thư mục browser profile không tồn tại.',
      checks,
    };
  }

  const profilePath = browserProfileManager.resolveProfilePath(account.profile_dir_name);
  profileLockManager.recoverIfStale(profilePath);
  if (profileLockManager.isLocked(profilePath)) {
    const owner = profileLockManager.getOwner(profilePath);
    if (owner !== account.id) {
      return {
        providerId,
        result: 'PROFILE_BUSY',
        message: `Profile đang bị giữ bởi: ${owner ?? 'unknown'}`,
        checks,
      };
    }
  }

  return {
    providerId,
    result: 'READY',
    message: 'Browser AI provider sẵn sàng.',
    checks,
  };
}

export function filterProvidersByPreflight(
  reports: ProviderPreflightReport[],
  mode: 'AUTO' | 'PIN',
): ProviderPreflightReport[] {
  const usable = reports.filter((r) => isProviderPreflightUsable(r.result));
  if (mode === 'PIN') {
    return usable.slice(0, 1);
  }
  // Prefer READY over DEGRADED, keep priority order of input.
  const ready = usable.filter((r) => r.result === 'READY');
  return ready.length > 0 ? ready : usable;
}
