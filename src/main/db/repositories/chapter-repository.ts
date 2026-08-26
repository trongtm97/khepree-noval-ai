import { createHash } from 'node:crypto';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { ChapterSourceStatus } from '@shared/constants/source-folder';
import type { ChapterType } from '@shared/constants/book-metadata';

export interface ChapterRow {
  id: string;
  project_id: string;
  chapter_number: number | null;
  chapter_type: ChapterType;
  sequence_order: number;
  display_title: string | null;
  chapter_title: string | null;
  source_text: string | null;
  source_hash: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  source_file_path: string | null;
  source_file_name: string | null;
  source_file_size: number | null;
  source_file_modified_at: string | null;
  source_file_hash: string | null;
  source_content_hash: string | null;
  source_status: ChapterSourceStatus;
  source_encoding: string | null;
  last_source_scan_at: string | null;
}

export interface CreateChapterInput {
  project_id: string;
  chapter_number?: number | null;
  chapter_type?: ChapterType;
  sequence_order: number;
  display_title?: string | null;
  chapter_title?: string | null;
  source_text?: string | null;
  status?: string;
  source_file_path?: string | null;
  source_file_name?: string | null;
  source_file_size?: number | null;
  source_file_modified_at?: string | null;
  source_file_hash?: string | null;
  source_content_hash?: string | null;
  source_status?: ChapterSourceStatus;
  source_encoding?: string | null;
  last_source_scan_at?: string | null;
}

export interface ChapterSourceMetadataPatch {
  source_file_path?: string | null;
  source_file_name?: string | null;
  source_file_size?: number | null;
  source_file_modified_at?: string | null;
  source_file_hash?: string | null;
  source_content_hash?: string | null;
  source_status?: ChapterSourceStatus;
  source_encoding?: string | null;
  last_source_scan_at?: string | null;
  source_text?: string | null;
  chapter_title?: string | null;
  display_title?: string | null;
  chapter_type?: ChapterType;
  sequence_order?: number;
  status?: string;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class ChapterRepository extends BaseRepository {
  create(input: CreateChapterInput): ChapterRow {
    const id = newId();
    const ts = touchTimestamps();
    const sourceText = input.source_text ?? null;
    const sourceHash = sourceText ? hashText(sourceText) : null;

    this.db
      .prepare(
        `INSERT INTO chapters (
          id, project_id, chapter_number, chapter_type, sequence_order, display_title,
          chapter_title, source_text, source_hash, status,
          created_at, updated_at,
          source_file_path, source_file_name, source_file_size, source_file_modified_at,
          source_file_hash, source_content_hash, source_status, source_encoding, last_source_scan_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.chapter_number ?? null,
        input.chapter_type ?? 'NORMAL',
        input.sequence_order,
        input.display_title ?? null,
        input.chapter_title ?? null,
        sourceText,
        sourceHash,
        input.status ?? 'pending',
        ts.created_at,
        ts.updated_at,
        input.source_file_path ?? null,
        input.source_file_name ?? null,
        input.source_file_size ?? null,
        input.source_file_modified_at ?? null,
        input.source_file_hash ?? null,
        input.source_content_hash ?? null,
        input.source_status ?? (sourceText ? 'SOURCE_READY' : 'NO_SOURCE'),
        input.source_encoding ?? null,
        input.last_source_scan_at ?? null,
      );

    return this.assertRow(this.getById(id), 'chapter', id);
  }

  getById(id: string): ChapterRow | null {
    return (
      (this.db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(id) as ChapterRow | undefined) ??
      null
    );
  }

  listByProject(projectId: string): ChapterRow[] {
    return this.db
      .prepare(
        `SELECT * FROM chapters WHERE project_id = ? ORDER BY sequence_order ASC`,
      )
      .all(projectId) as ChapterRow[];
  }

  getByProjectAndNumber(projectId: string, chapterNumber: number): ChapterRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM chapters WHERE project_id = ? AND chapter_number = ? LIMIT 1`,
        )
        .get(projectId, chapterNumber) as ChapterRow | undefined) ?? null
    );
  }

  getByProjectAndSequence(projectId: string, sequenceOrder: number): ChapterRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM chapters WHERE project_id = ? AND sequence_order = ? LIMIT 1`,
        )
        .get(projectId, sequenceOrder) as ChapterRow | undefined) ?? null
    );
  }

  getBySourcePath(projectId: string, sourceFilePath: string): ChapterRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM chapters WHERE project_id = ? AND source_file_path = ? LIMIT 1`,
        )
        .get(projectId, sourceFilePath) as ChapterRow | undefined) ?? null
    );
  }

  maxSequenceOrder(projectId: string): number {
    const row = this.db
      .prepare(`SELECT MAX(sequence_order) AS max_order FROM chapters WHERE project_id = ?`)
      .get(projectId) as { max_order: number | null } | undefined;
    return row?.max_order ?? 0;
  }

  update(id: string, patch: Partial<CreateChapterInput>): ChapterRow | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const sourceText =
      patch.source_text !== undefined ? patch.source_text : existing.source_text;
    const sourceHash = sourceText ? hashText(sourceText) : null;

    this.db
      .prepare(
        `UPDATE chapters SET
          chapter_number = ?,
          chapter_type = ?,
          sequence_order = ?,
          display_title = ?,
          chapter_title = ?,
          source_text = ?,
          source_hash = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.chapter_number !== undefined ? patch.chapter_number : existing.chapter_number,
        patch.chapter_type ?? existing.chapter_type,
        patch.sequence_order ?? existing.sequence_order,
        patch.display_title !== undefined ? patch.display_title : existing.display_title,
        patch.chapter_title !== undefined ? patch.chapter_title : existing.chapter_title,
        sourceText,
        sourceHash,
        patch.status ?? existing.status,
        utcNow(),
        id,
      );

    return this.getById(id);
  }

  updateSourceMetadata(id: string, patch: ChapterSourceMetadataPatch): ChapterRow | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const sourceText =
      patch.source_text !== undefined ? patch.source_text : existing.source_text;
    const sourceHash = sourceText ? hashText(sourceText) : existing.source_hash;

    this.db
      .prepare(
        `UPDATE chapters SET
          chapter_title = ?,
          display_title = ?,
          chapter_type = ?,
          sequence_order = ?,
          source_text = ?,
          source_hash = ?,
          status = ?,
          source_file_path = ?,
          source_file_name = ?,
          source_file_size = ?,
          source_file_modified_at = ?,
          source_file_hash = ?,
          source_content_hash = ?,
          source_status = ?,
          source_encoding = ?,
          last_source_scan_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.chapter_title !== undefined ? patch.chapter_title : existing.chapter_title,
        patch.display_title !== undefined ? patch.display_title : existing.display_title,
        patch.chapter_type ?? existing.chapter_type,
        patch.sequence_order ?? existing.sequence_order,
        sourceText,
        sourceHash,
        patch.status ?? existing.status,
        patch.source_file_path !== undefined
          ? patch.source_file_path
          : existing.source_file_path,
        patch.source_file_name !== undefined
          ? patch.source_file_name
          : existing.source_file_name,
        patch.source_file_size !== undefined
          ? patch.source_file_size
          : existing.source_file_size,
        patch.source_file_modified_at !== undefined
          ? patch.source_file_modified_at
          : existing.source_file_modified_at,
        patch.source_file_hash !== undefined
          ? patch.source_file_hash
          : existing.source_file_hash,
        patch.source_content_hash !== undefined
          ? patch.source_content_hash
          : existing.source_content_hash,
        patch.source_status ?? existing.source_status,
        patch.source_encoding !== undefined
          ? patch.source_encoding
          : existing.source_encoding,
        patch.last_source_scan_at !== undefined
          ? patch.last_source_scan_at
          : existing.last_source_scan_at,
        utcNow(),
        id,
      );

    return this.getById(id);
  }

  markSourceMissing(chapterId: string): ChapterRow | null {
    return this.updateSourceMetadata(chapterId, {
      source_status: 'SOURCE_MISSING',
      last_source_scan_at: utcNow(),
    });
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM chapters WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  searchFts(query: string, limit = 20): { chapter_id: string; rank: number }[] {
    return this.db
      .prepare(
        `SELECT chapter_id, rank
         FROM chapters_fts
         WHERE chapters_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as { chapter_id: string; rank: number }[];
  }
}
