import type { DatabaseManager } from '../db/database-manager';
import type { WorkerStateRow } from '../db/repositories/worker-state-repository';
import type { JobRow } from '../db/repositories/job-repository';
import type { WorkerMode } from '@shared/constants/job';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { getBrowserRuntimeManager } from '../automation/browser-runner/browser-runtime-manager';
import { healIdleWorkers } from './heal-workers';
import { logger } from '../logging/logger';
import { runtimeLockOwner } from '@shared/constants/browser-runtime';
import { resolveProjectWorker } from '../services/project-worker-resolver';
import type { ConcurrencyPolicy } from '@shared/constants/concurrency-policy';
import {
  canAdmitJob,
  providerKindForWorker,
  type ConcurrencySnapshot,
} from './concurrency-policy';

export interface SelectedWorker {
  worker: WorkerStateRow;
  accountId: string;
  profilePath: string;
}

export interface FairSelectOptions {
  policy: ConcurrencyPolicy;
  snapshot: ConcurrencySnapshot;
  /** Prefer workers assigned / resolved for this project. */
  projectId?: string | null;
}

/**
 * Select READY workers for PINNED / POOL modes.
 * Fair order: priority → quota/health → least-recently-used → project assignment.
 * Never selects LIMITED (until cooldown), DISABLED, OFFLINE, BUSY.
 */
export class WorkerPool {
  constructor(private readonly db: DatabaseManager) {}

  /** Candidates eligible to run a job right now (unsorted). */
  listAvailable(): WorkerStateRow[] {
    this.db.workerStates.clearExpiredLimits();
    healIdleWorkers(this.db);
    const now = Date.now();
    return this.db.workerStates.listEnabled().filter((w) => {
      if (w.health === 'DISABLED' || w.health === 'OFFLINE') return false;
      if (w.health === 'BUSY') return false;
      if (w.health === 'NEEDS_ATTENTION') return false;
      if (w.health === 'LIMITED') {
        if (w.limited_until && Date.parse(w.limited_until) > now) return false;
      } else if (w.health !== 'READY') {
        return false;
      }
      const account = this.db.googleAccounts.getById(w.google_account_id);
      if (!account || account.status === 'DISABLED') return false;
      if (account.status === 'NEEDS_ATTENTION' || account.status === 'LOGIN_REQUIRED') {
        return false;
      }
      const profile = this.db.googleAccounts.getProfile(w.google_account_id);
      if (!profile) return false;
      const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
      const lockOwner = profileLockManager.getOwner(profilePath);
      if (lockOwner) {
        if (lockOwner === runtimeLockOwner(w.google_account_id)) {
          // continue
        } else if (lockOwner.startsWith(`job:`)) {
          logger.info('Worker skipped — job holds browser profile', {
            accountId: w.google_account_id,
          });
          return false;
        } else {
          profileLockManager.recoverIfStale(profilePath);
          if (profileLockManager.isLocked(profilePath)) {
            logger.info('Worker skipped — browser profile locked', {
              accountId: w.google_account_id,
              owner: profileLockManager.getOwner(profilePath) ?? lockOwner,
            });
            return false;
          }
        }
      }
      const runtime = getBrowserRuntimeManager().getRuntime(w.google_account_id);
      if (runtime?.health === 'BUSY' || runtime?.health === 'NEEDS_ATTENTION') {
        return false;
      }
      return true;
    });
  }

  /**
   * Fair-sorted available workers for claiming.
   * Never returns DB-order first account blindly.
   */
  listAvailableFair(options?: { projectId?: string | null }): WorkerStateRow[] {
    const available = this.listAvailable();
    const assigned = options?.projectId
      ? this.assignedAccountIds(options.projectId)
      : new Set<string>();
    let preferredAccountId: string | null = null;
    if (options?.projectId) {
      const resolved = resolveProjectWorker(this.db, {
        projectId: options.projectId,
        purpose: 'translation',
      });
      preferredAccountId = resolved.accountId;
    }
    return this.sortFair(available, {
      preferredAccountId,
      assignedAccountIds: assigned,
    });
  }

  selectForJob(job: JobRow, fair?: FairSelectOptions): SelectedWorker | null {
    const mode: WorkerMode = job.worker_mode === 'PINNED' ? 'PINNED' : 'POOL';
    const available = this.listAvailable();

    if (mode === 'PINNED') {
      const pinned = job.pinned_account_id;
      if (!pinned) return null;
      const worker = available.find((w) => w.google_account_id === pinned);
      if (!worker) return null;
      if (fair && !this.passesAdmit(fair, worker, job.project_id)) return null;
      return this.toSelected(worker);
    }

    const resolved = resolveProjectWorker(this.db, {
      projectId: job.project_id,
      purpose: 'translation',
      jobId: job.id,
    });
    const assigned = this.assignedAccountIds(job.project_id);
    const preferred = available.filter((w) => assigned.has(w.google_account_id));
    const pool = preferred.length > 0 ? preferred : available;
    const sorted = this.sortFair(pool, {
      preferredAccountId: resolved.accountId,
      assignedAccountIds: assigned,
    });

    for (const worker of sorted) {
      if (fair && !this.passesAdmit(fair, worker, job.project_id)) continue;
      const selected = this.toSelected(worker);
      if (selected) return selected;
    }
    return null;
  }

  private passesAdmit(
    fair: FairSelectOptions,
    worker: WorkerStateRow,
    projectId: string,
  ): boolean {
    return canAdmitJob(fair.policy, fair.snapshot, {
      projectId,
      accountId: worker.google_account_id,
      providerKind: providerKindForWorker(this.db, worker.google_account_id),
    });
  }

  /**
   * priority ASC → healthy quota → LRU (last_active_at) → preferred / assigned → account id.
   */
  private sortFair(
    workers: WorkerStateRow[],
    opts: {
      preferredAccountId?: string | null;
      assignedAccountIds?: Set<string>;
    },
  ): WorkerStateRow[] {
    const preferred = opts.preferredAccountId ?? null;
    const assigned = opts.assignedAccountIds ?? new Set<string>();
    return [...workers].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;

      const quotaA = a.quota_state === 'exhausted' || a.health === 'LIMITED' ? 1 : 0;
      const quotaB = b.quota_state === 'exhausted' || b.health === 'LIMITED' ? 1 : 0;
      if (quotaA !== quotaB) return quotaA - quotaB;

      const lruA = a.last_active_at ? Date.parse(a.last_active_at) : 0;
      const lruB = b.last_active_at ? Date.parse(b.last_active_at) : 0;
      if (lruA !== lruB) return lruA - lruB;

      const prefA = preferred && a.google_account_id === preferred ? 0 : 1;
      const prefB = preferred && b.google_account_id === preferred ? 0 : 1;
      if (prefA !== prefB) return prefA - prefB;

      const asgA = assigned.has(a.google_account_id) ? 0 : 1;
      const asgB = assigned.has(b.google_account_id) ? 0 : 1;
      if (asgA !== asgB) return asgA - asgB;

      return a.google_account_id.localeCompare(b.google_account_id);
    });
  }

  private assignedAccountIds(projectId: string): Set<string> {
    const rows = this.db
      .getConnection()
      .prepare(
        `SELECT google_account_id FROM project_account_assignments WHERE project_id = ?`,
      )
      .all(projectId) as { google_account_id: string }[];
    return new Set(rows.map((r) => r.google_account_id));
  }

  private toSelected(worker: WorkerStateRow): SelectedWorker | null {
    const profile = this.db.googleAccounts.getProfile(worker.google_account_id);
    if (!profile) return null;
    return {
      worker,
      accountId: worker.google_account_id,
      profilePath: browserProfileManager.resolveProfilePath(profile.profile_dir_name),
    };
  }
}
