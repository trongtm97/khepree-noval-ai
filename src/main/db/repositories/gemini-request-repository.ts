import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { GeminiRequestStatus } from '@shared/constants/gemini';

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
  status?: GeminiRequestStatus;
}

export class GeminiRequestRepository extends BaseRepository {
  create(input: CreateGeminiRequestInput): GeminiRequestRow {
    const id = newId();
    const ts = touchTimestamps();
    const startedAt = utcNow();
    this.db
      .prepare(
        `INSERT INTO gemini_requests (
          id, correlation_id, project_id, google_account_id, job_id, pack_hash,
          status, raw_response_path, error_code, error_message,
          started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.correlation_id,
        input.project_id,
        input.google_account_id,
        input.job_id ?? null,
        input.pack_hash,
        input.status ?? 'pending',
        startedAt,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(
      (this.db.prepare(`SELECT * FROM gemini_requests WHERE id = ?`).get(id) as
        | GeminiRequestRow
        | undefined) ?? null,
      'gemini_request',
      id,
    );
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

  markRunning(id: string): GeminiRequestRow | null {
    this.db
      .prepare(
        `UPDATE gemini_requests SET status = 'running', updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), id);
    return this.getById(id);
  }

  markCompleted(
    id: string,
    rawResponsePath: string | null,
  ): GeminiRequestRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE gemini_requests SET
          status = 'completed',
          raw_response_path = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(rawResponsePath, now, now, id);
    return this.getById(id);
  }

  markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    rawResponsePath?: string | null,
  ): GeminiRequestRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE gemini_requests SET
          status = 'failed',
          error_code = ?,
          error_message = ?,
          raw_response_path = COALESCE(?, raw_response_path),
          completed_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(errorCode, errorMessage, rawResponsePath ?? null, now, now, id);
    return this.getById(id);
  }

  markCancelled(id: string): GeminiRequestRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE gemini_requests SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(now, now, id);
    return this.getById(id);
  }
}
