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

export interface SelectedWorker {
  worker: WorkerStateRow;
  accountId: string;
  profilePath: string;
}

/**
 * Select READY workers for PINNED / POOL modes.
 * Never selects LIMITED (until cooldown), DISABLED, OFFLINE, BUSY.
 */
export class WorkerPool {
  constructor(private readonly db: DatabaseManager) {}

  /** Candidates eligible to run a job right now. */
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
        // expired limit should have been cleared; treat as available
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
        // Persistent runtime for THIS account is OK — context reused across batches.
        if (lockOwner === runtimeLockOwner(w.google_account_id)) {
          // continue
        } else if (lockOwner.startsWith(`job:`)) {
          logger.info('Worker skipped — job holds browser profile', {
            accountId: w.google_account_id,
          });
          return false;
        } else {
          logger.info('Worker skipped — browser profile locked', {
            accountId: w.google_account_id,
            owner: lockOwner,
          });
          return false;
        }
      }
      const runtime = getBrowserRuntimeManager().getRuntime(w.google_account_id);
      if (runtime?.health === 'BUSY' || runtime?.health === 'NEEDS_ATTENTION') {
        return false;
      }
      return true;
    });
  }

  selectForJob(job: JobRow): SelectedWorker | null {
    const mode: WorkerMode = job.worker_mode === 'PINNED' ? 'PINNED' : 'POOL';
    const available = this.listAvailable();

    if (mode === 'PINNED') {
      const pinned = job.pinned_account_id;
      if (!pinned) return null;
      const worker = available.find((w) => w.google_account_id === pinned);
      if (!worker) return null;
      return this.toSelected(worker);
    }

    // POOL: prefer assigned project workers, then priority
    const assigned = this.assignedAccountIds(job.project_id);
    const preferred = available.filter((w) => assigned.has(w.google_account_id));
    const pool = preferred.length > 0 ? preferred : available;
    const worker = pool.at(0);
    if (!worker) return null;
    return this.toSelected(worker);
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
