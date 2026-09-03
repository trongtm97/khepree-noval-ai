import type Database from 'better-sqlite3';
import {
  type BatchImportFormat,
  type BatchImportProposedAction,
  type BatchImportResultStatus,
  type BatchImportSessionStatus,
  type BatchImportSourceKind,
} from '@shared/constants/batch-import';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface BatchImportSessionRow {
  id: string;
  source_kind: BatchImportSourceKind;
  source_path: string;
  source_label: string;
  durable_root: string | null;
  status: BatchImportSessionStatus;
  summary_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BatchImportCandidateRow {
  id: string;
  session_id: string;
  candidate_key: string;
  display_path: string;
  predicted_title: string;
  kind: string;
  format: BatchImportFormat;
  content_fingerprint: string;
  source_absolute_path: string;
  proposed_action: BatchImportProposedAction;
  selected: number;
  target_project_id: string | null;
  status: BatchImportResultStatus;
  result_project_id: string | null;
  result_json: string | null;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface BatchImportSummary {
  created: number;
  updated: number;
  skipped: number;
  skippedDuplicate: number;
  needsAttention: number;
  failed: number;
  total: number;
}

export class BatchImportRepository extends BaseRepository {
  createSession(input: {
    id?: string;
    sourceKind: BatchImportSourceKind;
    sourcePath: string;
    sourceLabel: string;
    durableRoot?: string | null;
    status?: BatchImportSessionStatus;
  }): BatchImportSessionRow {
    const id = input.id ?? newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO batch_import_sessions (
          id, source_kind, source_path, source_label, durable_root, status,
          summary_json, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      )
      .run(
        id,
        input.sourceKind,
        input.sourcePath,
        input.sourceLabel,
        input.durableRoot ?? null,
        input.status ?? 'PREFLIGHT',
        ts.created_at,
        ts.updated_at,
      );
    return this.getSession(id)!;
  }

  getSession(id: string): BatchImportSessionRow | null {
    return (
      this.db
        .prepare(`SELECT * FROM batch_import_sessions WHERE id = ?`)
        .get(id) as BatchImportSessionRow | undefined
    ) ?? null;
  }

  listIncompleteSessions(): BatchImportSessionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM batch_import_sessions
         WHERE status IN ('PREFLIGHT', 'COMMITTING')
         ORDER BY created_at DESC`,
      )
      .all() as BatchImportSessionRow[];
  }

  listRecentSessions(limit = 20): BatchImportSessionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM batch_import_sessions
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as BatchImportSessionRow[];
  }

  updateSession(
    id: string,
    patch: {
      status?: BatchImportSessionStatus;
      durableRoot?: string | null;
      summary?: BatchImportSummary | null;
      completedAt?: string | null;
    },
  ): BatchImportSessionRow | null {
    const existing = this.getSession(id);
    if (!existing) return null;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE batch_import_sessions SET
          status = ?,
          durable_root = ?,
          summary_json = ?,
          updated_at = ?,
          completed_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status ?? existing.status,
        patch.durableRoot !== undefined ? patch.durableRoot : existing.durable_root,
        patch.summary !== undefined
          ? patch.summary
            ? JSON.stringify(patch.summary)
            : null
          : existing.summary_json,
        now,
        patch.completedAt !== undefined ? patch.completedAt : existing.completed_at,
        id,
      );
    return this.getSession(id);
  }

  upsertCandidate(input: {
    id?: string;
    sessionId: string;
    candidateKey: string;
    displayPath: string;
    predictedTitle: string;
    kind: string;
    format: BatchImportFormat;
    contentFingerprint: string;
    sourceAbsolutePath: string;
    proposedAction: BatchImportProposedAction;
    selected: boolean;
    targetProjectId?: string | null;
    status?: BatchImportResultStatus;
  }): BatchImportCandidateRow {
    const existing = this.getCandidateByKey(input.sessionId, input.candidateKey);
    const ts = touchTimestamps();
    if (existing) {
      this.db
        .prepare(
          `UPDATE batch_import_candidates SET
            display_path = ?,
            predicted_title = ?,
            kind = ?,
            format = ?,
            content_fingerprint = ?,
            source_absolute_path = ?,
            proposed_action = ?,
            selected = ?,
            target_project_id = ?,
            status = ?,
            updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.displayPath,
          input.predictedTitle,
          input.kind,
          input.format,
          input.contentFingerprint,
          input.sourceAbsolutePath,
          input.proposedAction,
          input.selected ? 1 : 0,
          input.targetProjectId ?? null,
          input.status ?? existing.status,
          ts.updated_at,
          existing.id,
        );
      return this.getCandidate(existing.id)!;
    }
    const id = input.id ?? newId();
    this.db
      .prepare(
        `INSERT INTO batch_import_candidates (
          id, session_id, candidate_key, display_path, predicted_title, kind, format,
          content_fingerprint, source_absolute_path, proposed_action, selected,
          target_project_id, status, result_project_id, result_json, error_message,
          attempt_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
      )
      .run(
        id,
        input.sessionId,
        input.candidateKey,
        input.displayPath,
        input.predictedTitle,
        input.kind,
        input.format,
        input.contentFingerprint,
        input.sourceAbsolutePath,
        input.proposedAction,
        input.selected ? 1 : 0,
        input.targetProjectId ?? null,
        input.status ?? 'PENDING',
        ts.created_at,
        ts.updated_at,
      );
    return this.getCandidate(id)!;
  }

  getCandidate(id: string): BatchImportCandidateRow | null {
    return (
      this.db
        .prepare(`SELECT * FROM batch_import_candidates WHERE id = ?`)
        .get(id) as BatchImportCandidateRow | undefined
    ) ?? null;
  }

  getCandidateByKey(sessionId: string, candidateKey: string): BatchImportCandidateRow | null {
    return (
      this.db
        .prepare(
          `SELECT * FROM batch_import_candidates WHERE session_id = ? AND candidate_key = ?`,
        )
        .get(sessionId, candidateKey) as BatchImportCandidateRow | undefined
    ) ?? null;
  }

  listCandidates(sessionId: string): BatchImportCandidateRow[] {
    return this.db
      .prepare(
        `SELECT * FROM batch_import_candidates
         WHERE session_id = ?
         ORDER BY display_path COLLATE NOCASE`,
      )
      .all(sessionId) as BatchImportCandidateRow[];
  }

  updateCandidateResult(
    id: string,
    patch: {
      status: BatchImportResultStatus;
      resultProjectId?: string | null;
      resultJson?: unknown;
      errorMessage?: string | null;
      incrementAttempt?: boolean;
    },
  ): BatchImportCandidateRow | null {
    const existing = this.getCandidate(id);
    if (!existing) return null;
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE batch_import_candidates SET
          status = ?,
          result_project_id = ?,
          result_json = ?,
          error_message = ?,
          attempt_count = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status,
        patch.resultProjectId !== undefined
          ? patch.resultProjectId
          : existing.result_project_id,
        patch.resultJson !== undefined
          ? JSON.stringify(patch.resultJson)
          : existing.result_json,
        patch.errorMessage !== undefined ? patch.errorMessage : existing.error_message,
        patch.incrementAttempt ? existing.attempt_count + 1 : existing.attempt_count,
        now,
        id,
      );
    return this.getCandidate(id);
  }
}

/** Raw DB accessor for wiring from DatabaseManager without circular imports. */
export function createBatchImportRepository(db: Database.Database): BatchImportRepository {
  return new BatchImportRepository(db);
}
