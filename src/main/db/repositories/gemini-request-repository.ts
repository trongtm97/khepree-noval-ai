import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import {
  coarseStatusFromLifecycle,
  formatCorrelationMarker,
  isTerminalGeminiLifecycle,
  type GeminiRequestLifecycle,
  type GeminiRequestStatus,
} from '@shared/constants/gemini';

export interface AutomationEventRow {
  id: string;
  job_id: string | null;
  worker_id: string | null;
  event_type: string;
  payload: string | null;
  screenshot_path: string | null;
  created_at: string;
}

export interface InsertAutomationEventInput {
  id?: string;
  job_id?: string | null;
  worker_id?: string | null;
  event_type: string;
  payload?: string | null;
  screenshot_path?: string | null;
  created_at?: string;
}

export class AutomationEventRepository extends BaseRepository {
  insert(input: InsertAutomationEventInput): AutomationEventRow {
    const id = input.id ?? newId();
    const createdAt = input.created_at ?? utcNow();
    this.db
      .prepare(
        `INSERT INTO automation_events (
          id, job_id, worker_id, event_type, payload, screenshot_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.job_id ?? null,
        input.worker_id ?? null,
        input.event_type,
        input.payload ?? null,
        input.screenshot_path ?? null,
        createdAt,
      );
    return this.assertRow(
      (this.db.prepare(`SELECT * FROM automation_events WHERE id = ?`).get(id) as
        | AutomationEventRow
        | undefined) ?? null,
      'automation_event',
      id,
    );
  }

  listByJob(jobId: string, limit = 100): AutomationEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM automation_events WHERE job_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(jobId, limit) as AutomationEventRow[];
  }
}

export interface GeminiRequestRow {
  id: string;
  correlation_id: string;
  project_id: string;
  google_account_id: string;
  job_id: string | null;
  pack_hash: string;
  status: string;
  lifecycle: GeminiRequestLifecycle;
  marker: string | null;
  thread_ref: string | null;
  notebook_id: string | null;
  lifecycle_at: string | null;
  raw_response_path: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGeminiRequestInput {
  correlation_id: string;
  project_id: string;
  google_account_id: string;
  pack_hash: string;
  job_id?: string | null;
  notebook_id?: string | null;
  thread_ref?: string | null;
  marker?: string | null;
  lifecycle?: GeminiRequestLifecycle;
  status?: GeminiRequestStatus;
}

function parseLifecycleAt(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore
  }
  return {};
}

export class GeminiRequestRepository extends BaseRepository {
  create(input: CreateGeminiRequestInput): GeminiRequestRow {
    const id = newId();
    const ts = touchTimestamps();
    const startedAt = utcNow();
    const lifecycle = input.lifecycle ?? 'CREATED';
    const status = input.status ?? coarseStatusFromLifecycle(lifecycle);
    const marker = input.marker ?? formatCorrelationMarker(input.correlation_id);
    const lifecycleAt = JSON.stringify({ [lifecycle]: startedAt });
    this.db
      .prepare(
        `INSERT INTO gemini_requests (
          id, correlation_id, project_id, google_account_id, job_id, pack_hash,
          status, lifecycle, marker, thread_ref, notebook_id, lifecycle_at,
          raw_response_path, error_code, error_message,
          started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.correlation_id,
        input.project_id,
        input.google_account_id,
        input.job_id ?? null,
        input.pack_hash,
        status,
        lifecycle,
        marker,
        input.thread_ref ?? null,
        input.notebook_id ?? null,
        lifecycleAt,
        startedAt,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'gemini_request', id);
  }

  getById(id: string): GeminiRequestRow | null {
    return (
      (this.db.prepare(`SELECT * FROM gemini_requests WHERE id = ?`).get(id) as
        | GeminiRequestRow
        | undefined) ?? null
    );
  }

  getByCorrelationId(correlationId: string): GeminiRequestRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM gemini_requests WHERE correlation_id = ?`)
        .get(correlationId) as GeminiRequestRow | undefined) ?? null
    );
  }

  /** Open (non-terminal) request for same job + pack — idempotent resume key. */
  findOpenByJobAndPack(jobId: string, packHash: string): GeminiRequestRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM gemini_requests
           WHERE job_id = ? AND pack_hash = ?
             AND lifecycle NOT IN ('COMPLETED', 'FAILED')
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(jobId, packHash) as GeminiRequestRow | undefined) ?? null
    );
  }

  listNonTerminal(): GeminiRequestRow[] {
    return this.db
      .prepare(
        `SELECT * FROM gemini_requests
         WHERE lifecycle NOT IN ('COMPLETED', 'FAILED')
         ORDER BY updated_at ASC`,
      )
      .all() as GeminiRequestRow[];
  }

  setThreadRef(id: string, threadRef: string | null): GeminiRequestRow | null {
    this.db
      .prepare(`UPDATE gemini_requests SET thread_ref = ?, updated_at = ? WHERE id = ?`)
      .run(threadRef, utcNow(), id);
    return this.getById(id);
  }

  setLifecycle(
    id: string,
    lifecycle: GeminiRequestLifecycle,
    patch?: {
      rawResponsePath?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      threadRef?: string | null;
    },
  ): GeminiRequestRow | null {
    const row = this.getById(id);
    if (!row) return null;
    if (isTerminalGeminiLifecycle(row.lifecycle) && lifecycle !== row.lifecycle) {
      // Allow FAILED → nothing; COMPLETED sticky except explicit FAILED not used.
      if (row.lifecycle === 'COMPLETED' || row.lifecycle === 'FAILED') {
        return row;
      }
    }

    const now = utcNow();
    const stamps = parseLifecycleAt(row.lifecycle_at);
    stamps[lifecycle] = now;
    const status = coarseStatusFromLifecycle(lifecycle);
    const completedAt =
      lifecycle === 'COMPLETED' || lifecycle === 'FAILED' ? now : row.completed_at;

    this.db
      .prepare(
        `UPDATE gemini_requests SET
          lifecycle = ?,
          status = ?,
          lifecycle_at = ?,
          raw_response_path = COALESCE(?, raw_response_path),
          error_code = COALESCE(?, error_code),
          error_message = COALESCE(?, error_message),
          thread_ref = COALESCE(?, thread_ref),
          completed_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        lifecycle,
        status,
        JSON.stringify(stamps),
        patch?.rawResponsePath ?? null,
        patch?.errorCode ?? null,
        patch?.errorMessage ?? null,
        patch?.threadRef ?? null,
        completedAt,
        now,
        id,
      );
    return this.getById(id);
  }

  /** @deprecated Prefer setLifecycle — kept for older call sites. */
  markRunning(id: string): GeminiRequestRow | null {
    return this.setLifecycle(id, 'GENERATION_STARTED');
  }

  markCompleted(
    id: string,
    rawResponsePath: string | null,
  ): GeminiRequestRow | null {
    this.setLifecycle(id, 'RESPONSE_CAPTURED', { rawResponsePath });
    return this.setLifecycle(id, 'COMPLETED', { rawResponsePath });
  }

  markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    rawResponsePath?: string | null,
  ): GeminiRequestRow | null {
    return this.setLifecycle(id, 'FAILED', {
      errorCode,
      errorMessage,
      rawResponsePath: rawResponsePath ?? null,
    });
  }

  markCancelled(id: string): GeminiRequestRow | null {
    return this.setLifecycle(id, 'FAILED', {
      errorCode: 'CANCELLED',
      errorMessage: 'Cancelled',
    });
  }

  markUnknownAfterCrash(id: string): GeminiRequestRow | null {
    return this.setLifecycle(id, 'UNKNOWN_AFTER_CRASH', {
      errorCode: 'UNKNOWN_AFTER_CRASH',
      errorMessage: 'Process crashed after send confirmed — resume without resend',
    });
  }

  markAbandonedBeforeSend(id: string): GeminiRequestRow | null {
    return this.setLifecycle(id, 'FAILED', {
      errorCode: 'CRASH_BEFORE_SEND',
      errorMessage: 'Process crashed before SENT_CONFIRMED — safe to create a new request',
    });
  }

  /** Latest Gemini request for a job (thread / notebook inheritance for repair). */
  findLatestByJob(jobId: string): GeminiRequestRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM gemini_requests WHERE job_id = ? ORDER BY created_at DESC LIMIT 1`,
        )
        .get(jobId) as GeminiRequestRow | undefined) ?? null
    );
  }
}
