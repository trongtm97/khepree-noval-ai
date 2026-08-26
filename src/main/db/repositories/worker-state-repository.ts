import { BaseRepository } from './base-repository';
import { utcNow } from '../utils/timestamps';
import type { WorkerHealth } from '@shared/constants/job';

export interface WorkerStateRow {
  id: string;
  google_account_id: string;
  provider_type: string;
  quota_state: string;
  quota_reset_at: string | null;
  is_enabled: number;
  priority: number;
  config: string | null;
  last_active_at: string | null;
  health: string;
  current_job_id: string | null;
  busy_since: string | null;
  limited_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class WorkerStateRepository extends BaseRepository {
  getById(id: string): WorkerStateRow | null {
    return (
      (this.db.prepare(`SELECT * FROM worker_states WHERE id = ?`).get(id) as
        | WorkerStateRow
        | undefined) ?? null
    );
  }

  getByAccountId(accountId: string): WorkerStateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM worker_states WHERE google_account_id = ?`)
        .get(accountId) as WorkerStateRow | undefined) ?? null
    );
  }

  listEnabled(): WorkerStateRow[] {
    return this.db
      .prepare(
        `SELECT * FROM worker_states WHERE is_enabled = 1 ORDER BY priority ASC, created_at ASC`,
      )
      .all() as WorkerStateRow[];
  }

  listAll(): WorkerStateRow[] {
    return this.db
      .prepare(`SELECT * FROM worker_states ORDER BY priority ASC`)
      .all() as WorkerStateRow[];
  }

  setHealth(
    id: string,
    health: WorkerHealth,
    patch?: { lastError?: string | null; limitedUntil?: string | null },
  ): WorkerStateRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE worker_states SET
          health = ?,
          last_error = COALESCE(?, last_error),
          limited_until = COALESCE(?, limited_until),
          updated_at = ?,
          last_active_at = ?
        WHERE id = ?`,
      )
      .run(
        health,
        patch?.lastError ?? null,
        patch?.limitedUntil ?? null,
        now,
        now,
        id,
      );
    return this.getById(id);
  }

  markBusy(id: string, jobId: string): WorkerStateRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE worker_states SET
          health = 'BUSY',
          current_job_id = ?,
          busy_since = ?,
          updated_at = ?,
          last_active_at = ?
        WHERE id = ?`,
      )
      .run(jobId, now, now, now, id);
    return this.getById(id);
  }

  markReady(id: string): WorkerStateRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE worker_states SET
          health = CASE WHEN health = 'DISABLED' THEN 'DISABLED' ELSE 'READY' END,
          current_job_id = NULL,
          busy_since = NULL,
          updated_at = ?,
          last_active_at = ?
        WHERE id = ?`,
      )
      .run(now, now, id);
    return this.getById(id);
  }

  markLimited(id: string, limitedUntilIso: string, error: string): WorkerStateRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE worker_states SET
          health = 'LIMITED',
          quota_state = 'exhausted',
          limited_until = ?,
          quota_reset_at = ?,
          last_error = ?,
          current_job_id = NULL,
          busy_since = NULL,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(limitedUntilIso, limitedUntilIso, error, now, id);
    return this.getById(id);
  }

  /** Clear LIMITED when cooldown elapsed. */
  clearExpiredLimits(): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE worker_states SET
          health = 'READY',
          quota_state = 'ok',
          limited_until = NULL,
          updated_at = ?
        WHERE health = 'LIMITED'
          AND limited_until IS NOT NULL
          AND limited_until <= ?`,
      )
      .run(now, now);
    return result.changes;
  }

  countBusy(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM worker_states WHERE health = 'BUSY'`)
      .get() as { c: number };
    return row.c;
  }
}
