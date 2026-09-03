import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export interface SourcePendingRevisionRow {
  id: string;
  project_id: string;
  chapter_id: string;
  chapter_number: number;
  content_hash: string;
  detected_json: string;
  enqueue_fingerprint: string;
  status: string;
  created_at: string;
  applied_at: string | null;
}

export class SourcePendingRevisionRepository extends BaseRepository {
  upsertPending(input: {
    projectId: string;
    chapterId: string;
    chapterNumber: number;
    contentHash: string;
    detectedJson: string;
    enqueueFingerprint: string;
  }): SourcePendingRevisionRow {
    const existing = this.db
      .prepare(
        `SELECT * FROM source_pending_revisions
         WHERE project_id = ? AND chapter_id = ? AND content_hash = ?`,
      )
      .get(input.projectId, input.chapterId, input.contentHash) as
      | SourcePendingRevisionRow
      | undefined;

    if (existing) {
      return existing;
    }

    const id = newId();
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO source_pending_revisions
         (id, project_id, chapter_id, chapter_number, content_hash, detected_json,
          enqueue_fingerprint, status, created_at, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
      )
      .run(
        id,
        input.projectId,
        input.chapterId,
        input.chapterNumber,
        input.contentHash,
        input.detectedJson,
        input.enqueueFingerprint,
        now,
      );
    return this.getById(id)!;
  }

  getById(id: string): SourcePendingRevisionRow | null {
    return (
      (this.db.prepare(`SELECT * FROM source_pending_revisions WHERE id = ?`).get(id) as
        | SourcePendingRevisionRow
        | undefined) ?? null
    );
  }

  listPendingForProject(projectId: string): SourcePendingRevisionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM source_pending_revisions
         WHERE project_id = ? AND status = 'pending'
         ORDER BY created_at ASC`,
      )
      .all(projectId) as SourcePendingRevisionRow[];
  }

  markApplied(id: string): void {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE source_pending_revisions SET status = 'applied', applied_at = ? WHERE id = ?`,
      )
      .run(now, id);
  }

  markCancelled(id: string): void {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE source_pending_revisions SET status = 'cancelled', applied_at = ? WHERE id = ?`,
      )
      .run(now, id);
  }

  hasPendingForChapter(projectId: string, chapterId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS ok FROM source_pending_revisions
         WHERE project_id = ? AND chapter_id = ? AND status = 'pending' LIMIT 1`,
      )
      .get(projectId, chapterId) as { ok: number } | undefined;
    return Boolean(row?.ok);
  }
}
