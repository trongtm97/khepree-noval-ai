import type { DatabaseManager } from '../db/database-manager';
import { healIdleWorkers } from '../jobs/heal-workers';
import { WorkerPool } from '../jobs/worker-pool';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { getBrowserRuntimeManager } from '../automation/browser-runner/browser-runtime-manager';
import { runtimeLockOwner } from '@shared/constants/browser-runtime';
import type { AccountActiveJob, AccountAvailabilityDto } from '@shared/schemas/account-availability';
import {
  computeAvailabilitySummary,
  formatAvailabilityPreflightMessage,
  resolveAccountAvailability,
  type AccountAvailabilityInput,
} from '@shared/utils/account-availability';
import type { AccountAvailabilitySummary } from '@shared/schemas/account-availability';

const TERMINAL_JOB_STATES = new Set([
  'COMPLETED',
  'ACCEPTED_WITH_WARNINGS',
  'FAILED',
  'NEEDS_ATTENTION',
  'CANCELLED',
  'SKIPPED',
]);

const ACTIVE_JOB_STATES = new Set([
  'QUEUED',
  'WAITING_WORKER',
  'PREPARING',
  'RUNNING',
  'SENDING',
  'WAITING_AI',
  'PARSING',
  'QA',
  'REPAIRING',
  'TRANSLATING',
  'PAUSED',
]);

function parseProgress(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Domain-level account availability — shared by scheduler probes, DTO mapping, and preflight.
 */
export class AccountAvailabilityService {
  private readonly pool: WorkerPool;

  constructor(private readonly db: DatabaseManager) {
    this.pool = new WorkerPool(db);
  }

  resolve(accountId: string, now = Date.now()): AccountAvailabilityDto {
    const input = this.buildInput(accountId, now);
    return resolveAccountAvailability(input);
  }

  resolveAll(now = Date.now()): Map<string, AccountAvailabilityDto> {
    const eligible = new Set(
      this.pool.listAvailable().map((w) => w.google_account_id),
    );
    const map = new Map<string, AccountAvailabilityDto>();
    for (const detail of this.db.googleAccounts.list()) {
      const input = this.buildInput(detail.id, now, eligible);
      map.set(detail.id, resolveAccountAvailability(input));
    }
    return map;
  }

  summarize(now = Date.now()): AccountAvailabilitySummary {
    const items = [...this.resolveAll(now).values()].map((availability) => ({
      availability,
    }));
    return computeAvailabilitySummary(items);
  }

  preflightMessage(now = Date.now()): string | null {
    const accounts = this.db.googleAccounts.list();
    const availabilityById = this.resolveAll(now);
    const items = accounts.map((a) => {
      const availability =
        availabilityById.get(a.id) ??
        resolveAccountAvailability({
          accountId: a.id,
          accountStatus: 'DISABLED',
          workerEnabled: false,
          workerHealth: null,
          workerCurrentJobId: null,
          limitedUntil: null,
          hasProfile: false,
          profileLease: null,
          runtimeHealth: null,
          profileLockBlocked: false,
          schedulerEligible: false,
          activeJob: null,
          now,
        });
      return { label: a.label, availability };
    });
    return formatAvailabilityPreflightMessage(items);
  }

  private buildInput(
    accountId: string,
    now: number,
    eligibleSet?: Set<string>,
  ): AccountAvailabilityInput {
    healIdleWorkers(this.db);

    const account = this.db.googleAccounts.getById(accountId);
    const detail = this.db.googleAccounts.getDetail(accountId);
    const worker = this.db.workerStates.getByAccountId(accountId);
    const profile = this.db.googleAccounts.getProfile(accountId);

    const eligible =
      eligibleSet ?? new Set(this.pool.listAvailable().map((w) => w.google_account_id));

    let profileLease: AccountAvailabilityInput['profileLease'] = null;
    let profileLockBlocked = false;
    const profilePath = profile
      ? browserProfileManager.resolveProfilePath(profile.profile_dir_name)
      : null;

    if (profilePath) {
      const lease = profileLockManager.getLease(profilePath);
      if (lease) {
        profileLease = {
          ownerId: lease.ownerId,
          operation: lease.operation,
          label: lease.label,
        };
      }
      const lockOwner = profileLockManager.getOwner(profilePath);
      if (lockOwner) {
        if (lockOwner === runtimeLockOwner(accountId)) {
          // runtime nest — not blocked
        } else if (lockOwner.startsWith('job:')) {
          profileLockBlocked = true;
        } else {
          profileLockManager.recoverIfStale(profilePath);
          if (profileLockManager.isLocked(profilePath)) {
            profileLockBlocked = true;
          }
        }
      }
    }

    const runtime = getBrowserRuntimeManager().getRuntime(accountId);

    return {
      accountId,
      accountStatus: account?.status ?? 'DISABLED',
      workerEnabled: detail?.worker_enabled ?? (worker?.is_enabled === 1),
      workerHealth: worker?.health ?? null,
      workerCurrentJobId: worker?.current_job_id ?? null,
      limitedUntil: worker?.limited_until ?? null,
      hasProfile: profile != null,
      profileLease,
      runtimeHealth: runtime?.health ?? null,
      profileLockBlocked,
      schedulerEligible: eligible.has(accountId),
      activeJob: this.resolveActiveJob(accountId, worker?.current_job_id ?? null),
      now,
    };
  }

  private resolveActiveJob(
    accountId: string,
    workerJobId: string | null,
  ): AccountActiveJob | null {
    const seen = new Set<string>();
    const tryJob = (jobId: string | null | undefined): AccountActiveJob | null => {
      if (!jobId || seen.has(jobId)) return null;
      seen.add(jobId);
      const job = this.db.jobs.getById(jobId);
      if (!job || TERMINAL_JOB_STATES.has(job.state)) return null;
      if (!ACTIVE_JOB_STATES.has(job.state)) return null;

      const pinned = job.pinned_account_id === accountId;
      const progress = parseProgress(job.progress);
      const progressAccount =
        typeof progress?.accountId === 'string' ? progress.accountId : null;
      if (!pinned && progressAccount !== accountId && job.worker_id) {
        const worker = this.db.workerStates.getById(job.worker_id);
        if (worker?.google_account_id !== accountId) return null;
      }

      const project = this.db.projects.getById(job.project_id);
      return {
        jobId: job.id,
        projectId: job.project_id,
        projectName: project?.title ?? null,
        chapterFrom: job.chapter_from,
        chapterTo: job.chapter_to,
        paragraphsDone:
          typeof progress?.paragraphsDone === 'number' ? progress.paragraphsDone : null,
        paragraphsTotal:
          typeof progress?.paragraphsTotal === 'number' ? progress.paragraphsTotal : null,
      };
    };

    const fromWorker = tryJob(workerJobId);
    if (fromWorker) return fromWorker;

    for (const job of this.db.jobs.listAll(200)) {
      if (TERMINAL_JOB_STATES.has(job.state) || !ACTIVE_JOB_STATES.has(job.state)) continue;
      const active = tryJob(job.id);
      if (active) return active;
    }

    return null;
  }
}

let singleton: AccountAvailabilityService | null = null;

export function getAccountAvailabilityService(db: DatabaseManager): AccountAvailabilityService {
  singleton ??= new AccountAvailabilityService(db);
  return singleton;
}

export function resetAccountAvailabilityServiceForTests(): void {
  singleton = null;
}
