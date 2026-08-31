import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { ExecutionAccountKind } from '../../ai/execution-target';
import type { AiProviderType } from '@shared/constants/ai-provider';

export interface AiRequestRow {
  id: string;
  correlation_id: string;
  project_id: string;
  provider_id: string;
  provider_type: string;
  account_kind: string;
  account_id: string;
  job_id: string | null;
  request_id: string | null;
  pack_hash: string | null;
  status: string;
  lifecycle: string | null;
  raw_response_path: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAiRequestInput {
  project_id: string;
  provider_id: string;
  provider_type: AiProviderType;
  account_kind: ExecutionAccountKind;
  account_id: string;
  job_id?: string | null;
  request_id?: string | null;
  pack_hash?: string | null;
  status: string;
  lifecycle?: string | null;
  correlation_id?: string;
}

export class AiRequestRepository extends BaseRepository {
  create(input: CreateAiRequestInput): AiRequestRow {
    const id = newId();
    const correlationId = input.correlation_id ?? newId();
    const { created_at, updated_at } = touchTimestamps();
    const started = utcNow();

    this.db
      .prepare(
        `INSERT INTO ai_requests (
          id, correlation_id, project_id, provider_id, provider_type,
          account_kind, account_id, job_id, request_id, pack_hash,
          status, lifecycle, raw_response_path, error_code, error_message,
          started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        correlationId,
        input.project_id,
        input.provider_id,
        input.provider_type,
        input.account_kind,
        input.account_id,
        input.job_id ?? null,
        input.request_id ?? null,
        input.pack_hash ?? null,
        input.status,
        input.lifecycle ?? null,
        started,
        created_at,
        updated_at,
      );

    return this.assertRow(this.getById(id), 'ai_request', id);
  }

  getById(id: string): AiRequestRow | null {
    return (
      (this.db.prepare(`SELECT * FROM ai_requests WHERE id = ?`).get(id) as
        | AiRequestRow
        | undefined) ?? null
    );
  }

  getByCorrelationId(correlationId: string): AiRequestRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM ai_requests WHERE correlation_id = ?`)
        .get(correlationId) as AiRequestRow | undefined) ?? null
    );
  }

  listByJob(jobId: string): AiRequestRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_requests WHERE job_id = ? ORDER BY created_at DESC`,
      )
      .all(jobId) as AiRequestRow[];
  }

  updateStatus(
    id: string,
    status: string,
    patch?: {
      lifecycle?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      rawResponsePath?: string | null;
      completed?: boolean;
    },
  ): AiRequestRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_requests SET
          status = ?,
          lifecycle = COALESCE(?, lifecycle),
          error_code = COALESCE(?, error_code),
          error_message = COALESCE(?, error_message),
          raw_response_path = COALESCE(?, raw_response_path),
          completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        status,
        patch?.lifecycle ?? null,
        patch?.errorCode ?? null,
        patch?.errorMessage ?? null,
        patch?.rawResponsePath ?? null,
        patch?.completed ? 1 : 0,
        now,
        now,
        id,
      );
    return this.getById(id);
  }
}
