import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { JobAttemptState, WorkerMode } from '@shared/constants/job';

export interface JobRow {
  id: string;
  project_id: string;
  type: string;
  state: string;
  worker_id: string | null;
  config: string | null;
  progress: string | null;
  error: string | null;
  paused_reason: string | null;
  priority: number;
  chapter_from: number | null;
  chapter_to: number | null;
  worker_mode: string;
  pinned_account_id: string | null;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  scheduled_at: string | null;
  edition_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobAttemptRow {
  id: string;
  job_id: string;
  attempt_number: number;
  state: string;
  error: string | null;
  reason: string | null;
  input_ref: string | null;
  output: string | null;
  result: string | null;
  provider_type: string | null;
  account_id: string | null;
  notebook_id: string | null;
  thread_ref: string | null;
  pack_mode: string | null;
  knowledge_version: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  project_id: string;
  type: string;
  state?: string;
  worker_id?: string | null;
  config?: string | null;
  priority?: number;
  chapter_from?: number | null;
  chapter_to?: number | null;
  worker_mode?: WorkerMode;
  pinned_account_id?: string | null;
  scheduled_at?: string | null;
  edition_id?: string | null;
}

export interface StartAttemptInput {
  job_id: string;
  attempt_number: number;
  reason?: string | null;
  input_ref?: string | null;
  state?: JobAttemptState;
  provider_type?: string | null;
  account_id?: string | null;
  notebook_id?: string | null;
  thread_ref?: string | null;
  pack_mode?: string | null;
  knowledge_version?: number | null;
}

const ACTIVE_RUN_STATES = [
  'PREPARING',
  'WAITING_WORKER',
  'SENDING',
  'WAITING_AI',
  'RUNNING',
  'PARSING',
  'QA',
  'REPAIRING',
] as const;

export class JobRepository extends BaseRepository {
  create(input: CreateJobInput): JobRow {
    const id = newId();
    const ts = touchTimestamps();

    this.db
      .prepare(
        `INSERT INTO jobs (
          id, project_id, type, state, worker_id, config, progress, error, paused_reason,
          priority, chapter_from, chapter_to, worker_mode, pinned_account_id, attempt_count,
          lease_owner, lease_expires_at, scheduled_at, edition_id,
          created_at, updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, NULL, NULL)`,
      )
      .run(
        id,
        input.project_id,
        input.type,
        input.state ?? 'QUEUED',
        input.worker_id ?? null,
        input.config ?? null,
        input.priority ?? 100,
        input.chapter_from ?? null,
        input.chapter_to ?? null,
        input.worker_mode ?? 'POOL',
        input.pinned_account_id ?? null,
        input.scheduled_at ?? null,
        input.edition_id ?? null,
        ts.created_at,
        ts.updated_at,
      );

    return this.assertRow(this.getById(id), 'job', id);
  }

  getById(id: string): JobRow | null {
    return (
      (this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined) ?? null
    );
  }

  updateState(id: string, state: string, error?: string | null): JobRow | null {
    const now = utcNow();
    const started = ACTIVE_RUN_STATES.includes(state as (typeof ACTIVE_RUN_STATES)[number])
      ? now
      : null;
    const completed = [
      'COMPLETED',
      'FAILED',
      'NEEDS_ATTENTION',
      'SKIPPED',
      'ACCEPTED_WITH_WARNINGS',
      'CANCELLED',
    ].includes(state)
      ? now
      : null;

    if (started) {
      this.db
        .prepare(
          `UPDATE jobs SET state = ?, error = ?, updated_at = ?,
            started_at = COALESCE(started_at, ?) WHERE id = ?`,
        )
        .run(state, error ?? null, now, started, id);
    } else if (completed) {
      this.db
        .prepare(
          `UPDATE jobs SET state = ?, error = ?, updated_at = ?, completed_at = ?,
            lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`,
        )
        .run(state, error ?? null, now, completed, id);
    } else {
      this.db
        .prepare(`UPDATE jobs SET state = ?, error = ?, updated_at = ? WHERE id = ?`)
        .run(state, error ?? null, now, id);
    }

    return this.getById(id);
  }

  updateProgress(id: string, progressJson: string): JobRow | null {
    this.db
      .prepare(`UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?`)
      .run(progressJson, utcNow(), id);
    return this.getById(id);
  }

  updateConfig(id: string, configJson: string): JobRow | null {
    this.db
      .prepare(`UPDATE jobs SET config = ?, updated_at = ? WHERE id = ?`)
      .run(configJson, utcNow(), id);
    return this.getById(id);
  }

  assignWorker(id: string, workerId: string | null): JobRow | null {
    this.db
      .prepare(`UPDATE jobs SET worker_id = ?, updated_at = ? WHERE id = ?`)
      .run(workerId, utcNow(), id);
    return this.getById(id);
  }

  setPinnedAccount(id: string, accountId: string | null, mode: WorkerMode): JobRow | null {
    this.db
      .prepare(
        `UPDATE jobs SET pinned_account_id = ?, worker_mode = ?, updated_at = ? WHERE id = ?`,
      )
      .run(accountId, mode, utcNow(), id);
    return this.getById(id);
  }

  setPriority(id: string, priority: number): JobRow | null {
    this.db
      .prepare(`UPDATE jobs SET priority = ?, updated_at = ? WHERE id = ?`)
      .run(priority, utcNow(), id);
    return this.getById(id);
  }

  markNeedsAttention(id: string, reason: string, error: string): JobRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE jobs SET state = 'NEEDS_ATTENTION', paused_reason = ?, error = ?,
          updated_at = ?, completed_at = ?, lease_owner = NULL, lease_expires_at = NULL WHERE id = ?`,
      )
      .run(reason, error, now, now, id);
    return this.getById(id);
  }

  /**
   * Atomically claim next QUEUED/WAITING_WORKER job (durable SQLite).
   * Optional projectId restricts to one project (fair round-robin scheduling).
   */
  claimNext(options: {
    leaseOwner: string;
    leaseMs: number;
    workerId: string;
    accountId: string;
    projectId?: string | null;
    excludeProjectIds?: readonly string[];
  }): JobRow | null {
    const now = utcNow();
    const expires = new Date(Date.now() + options.leaseMs).toISOString();

    const exclude = options.excludeProjectIds ?? [];
    const excludeClause =
      exclude.length > 0
        ? `AND project_id NOT IN (${exclude.map(() => '?').join(',')})`
        : '';
    const projectClause = options.projectId ? 'AND project_id = ?' : '';

    const params: unknown[] = [now, options.accountId, options.accountId, now];
    if (options.projectId) params.push(options.projectId);
    if (exclude.length > 0) params.push(...exclude);

    const candidate = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE state IN ('QUEUED', 'WAITING_WORKER')
           AND (scheduled_at IS NULL OR scheduled_at <= ?)
           AND (
             (worker_mode = 'PINNED' AND pinned_account_id = ?)
             OR (worker_mode = 'POOL' AND (pinned_account_id IS NULL OR pinned_account_id = ?))
           )
           AND (lease_owner IS NULL OR lease_expires_at < ?)
           ${projectClause}
           ${excludeClause}
         ORDER BY priority ASC, COALESCE(chapter_from, 2147483647) ASC, created_at ASC
         LIMIT 1`,
      )
      .get(...params) as JobRow | undefined;

    if (!candidate) return null;

    const result = this.db
      .prepare(
        `UPDATE jobs SET
          state = 'PREPARING',
          worker_id = ?,
          lease_owner = ?,
          lease_expires_at = ?,
          attempt_count = attempt_count + 1,
          started_at = COALESCE(started_at, ?),
          error = CASE
            WHEN error = 'Lease expired — requeued' THEN NULL
            ELSE error
          END,
          updated_at = ?
        WHERE id = ?
          AND state IN ('QUEUED', 'WAITING_WORKER')
          AND (lease_owner IS NULL OR lease_expires_at < ?)`,
      )
      .run(
        options.workerId,
        options.leaseOwner,
        expires,
        now,
        now,
        candidate.id,
        now,
      );

    if (result.changes === 0) return null;
    return this.getById(candidate.id);
  }

  /**
   * Projects with runnable queued jobs, oldest waiting first (fair RR base order).
   */
  listQueuedProjectIds(): string[] {
    const now = utcNow();
    const rows = this.db
      .prepare(
        `SELECT project_id AS projectId, MIN(created_at) AS waitSince
         FROM jobs
         WHERE state IN ('QUEUED', 'WAITING_WORKER')
           AND (scheduled_at IS NULL OR scheduled_at <= ?)
           AND (lease_owner IS NULL OR lease_expires_at < ?)
         GROUP BY project_id
         ORDER BY waitSince ASC`,
      )
      .all(now, now) as { projectId: string; waitSince: string }[];
    return rows.map((r) => r.projectId);
  }

  renewLease(id: string, leaseOwner: string, leaseMs: number): boolean {
    const expires = new Date(Date.now() + leaseMs).toISOString();
    const result = this.db
      .prepare(
        `UPDATE jobs SET
          lease_expires_at = ?,
          updated_at = ?,
          error = CASE
            WHEN error = 'Lease expired — requeued' THEN NULL
            ELSE error
          END
         WHERE id = ? AND lease_owner = ?`,
      )
      .run(expires, utcNow(), id, leaseOwner);
    return result.changes > 0;
  }

  releaseLease(id: string): void {
    this.db
      .prepare(
        `UPDATE jobs SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), id);
  }

  /** Expired leases on active jobs → requeue WAITING_WORKER (crash recovery). */
  recoverExpiredLeases(): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE jobs SET
          state = 'QUEUED',
          lease_owner = NULL,
          lease_expires_at = NULL,
          worker_id = NULL,
          error = COALESCE(error, 'Lease expired — requeued'),
          updated_at = ?
        WHERE lease_expires_at IS NOT NULL
          AND lease_expires_at < ?
          AND state IN ('PREPARING', 'WAITING_WORKER', 'SENDING', 'WAITING_AI', 'RUNNING', 'PARSING', 'QA', 'REPAIRING')`,
      )
      .run(now, now);
    return result.changes;
  }

  pauseAllQueued(): number {
    const result = this.db
      .prepare(
        `UPDATE jobs SET state = 'PAUSED', paused_reason = 'pause_all', updated_at = ?
         WHERE state IN ('QUEUED', 'WAITING_WORKER')`,
      )
      .run(utcNow());
    return result.changes;
  }

  resumeAllPaused(): number {
    const result = this.db
      .prepare(
        `UPDATE jobs SET state = 'QUEUED', paused_reason = NULL, updated_at = ?
         WHERE state = 'PAUSED'`,
      )
      .run(utcNow());
    return result.changes;
  }

  requeueFailed(id: string): JobRow | null {
    this.db
      .prepare(
        `UPDATE jobs SET state = 'QUEUED', error = NULL, paused_reason = NULL,
          completed_at = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND state IN ('FAILED', 'NEEDS_ATTENTION', 'CANCELLED', 'SKIPPED')`,
      )
      .run(utcNow(), id);
    return this.getById(id);
  }

  /** Wave commit barrier hard conflict — re-run with latest knowledge. */
  requeueForRetranslate(id: string, reason: string): JobRow | null {
    this.db
      .prepare(
        `UPDATE jobs SET state = 'QUEUED', error = ?, paused_reason = NULL,
          completed_at = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(reason, utcNow(), id);
    return this.getById(id);
  }

  countActiveLeases(): number {
    const now = utcNow();
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM jobs
         WHERE lease_owner IS NOT NULL AND lease_expires_at > ?
           AND state NOT IN ('COMPLETED','FAILED','CANCELLED','SKIPPED','ACCEPTED_WITH_WARNINGS','PAUSED','QUEUED')`,
      )
      .get(now) as { c: number };
    return row.c;
  }

  listByProject(projectId: string): JobRow[] {
    return this.db
      .prepare(`SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC`)
      .all(projectId) as JobRow[];
  }

  listAll(limit = 100): JobRow[] {
    return this.db
      .prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as JobRow[];
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  startAttempt(input: StartAttemptInput): JobAttemptRow {
    const id = newId();
    const ts = touchTimestamps();
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO job_attempts (
          id, job_id, attempt_number, state, error, reason, input_ref, output, result,
          provider_type, account_id, notebook_id, thread_ref, pack_mode, knowledge_version,
          started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.job_id,
        input.attempt_number,
        input.state ?? 'RUNNING',
        input.reason ?? null,
        input.input_ref ?? null,
        input.provider_type ?? null,
        input.account_id ?? null,
        input.notebook_id ?? null,
        input.thread_ref ?? null,
        input.pack_mode ?? null,
        input.knowledge_version ?? null,
        now,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getAttemptById(id), 'job_attempt', id);
  }

  getAttemptById(id: string): JobAttemptRow | null {
    return (
      (this.db.prepare(`SELECT * FROM job_attempts WHERE id = ?`).get(id) as
        | JobAttemptRow
        | undefined) ?? null
    );
  }

  completeAttempt(
    id: string,
    patch: {
      state: JobAttemptState;
      output?: string | null;
      result?: string | null;
      error?: string | null;
      input_ref?: string | null;
      provider_type?: string | null;
      account_id?: string | null;
      notebook_id?: string | null;
      thread_ref?: string | null;
      pack_mode?: string | null;
      knowledge_version?: number | null;
    },
  ): JobAttemptRow | null {
    const existing = this.getAttemptById(id);
    if (!existing) return null;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE job_attempts SET
          state = ?,
          output = COALESCE(?, output),
          result = COALESCE(?, result),
          error = COALESCE(?, error),
          input_ref = COALESCE(?, input_ref),
          provider_type = ?,
          account_id = ?,
          notebook_id = ?,
          thread_ref = ?,
          pack_mode = ?,
          knowledge_version = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.state,
        patch.output ?? null,
        patch.result ?? null,
        patch.error ?? null,
        patch.input_ref ?? null,
        patch.provider_type !== undefined ? patch.provider_type : existing.provider_type,
        patch.account_id !== undefined ? patch.account_id : existing.account_id,
        patch.notebook_id !== undefined ? patch.notebook_id : existing.notebook_id,
        patch.thread_ref !== undefined ? patch.thread_ref : existing.thread_ref,
        patch.pack_mode !== undefined ? patch.pack_mode : existing.pack_mode,
        patch.knowledge_version !== undefined
          ? patch.knowledge_version
          : existing.knowledge_version,
        now,
        now,
        id,
      );
    return this.getAttemptById(id);
  }

  listAttempts(jobId: string): JobAttemptRow[] {
    return this.db
      .prepare(
        `SELECT * FROM job_attempts WHERE job_id = ? ORDER BY attempt_number ASC`,
      )
      .all(jobId) as JobAttemptRow[];
  }

  markRunningAttemptsCrashed(jobId: string): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE job_attempts SET
          state = 'CRASHED',
          error = COALESCE(error, 'Process interrupted'),
          result = COALESCE(result, '{"crash":true}'),
          completed_at = ?,
          updated_at = ?
        WHERE job_id = ? AND state = 'RUNNING' AND completed_at IS NULL`,
      )
      .run(now, now, jobId);
    return result.changes;
  }

  /** All RUNNING attempts across jobs — process crash recovery. */
  markAllRunningAttemptsCrashed(): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE job_attempts SET
          state = 'CRASHED',
          error = COALESCE(error, 'Process interrupted'),
          result = COALESCE(result, '{"crash":true}'),
          completed_at = ?,
          updated_at = ?
        WHERE state = 'RUNNING' AND completed_at IS NULL`,
      )
      .run(now, now);
    return result.changes;
  }
}
