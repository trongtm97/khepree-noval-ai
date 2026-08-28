import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps } from '../utils/timestamps';
import type { TabularUndoEntry } from '../../tabular/types';

export interface ImportHistoryRow {
  id: string;
  project_id: string | null;
  edition_id: string | null;
  data_type: string;
  file_name: string;
  file_format: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  status: string;
  undo_entries_json: string | null;
  created_at: string;
}

export interface CreateImportHistoryInput {
  project_id?: string | null;
  edition_id?: string | null;
  data_type: string;
  file_name: string;
  file_format: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  status?: string;
  undo_entries?: TabularUndoEntry[];
}

export class ImportHistoryRepository extends BaseRepository {
  create(input: CreateImportHistoryInput): ImportHistoryRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO import_history (
          id, project_id, edition_id, data_type, file_name, file_format,
          row_count, inserted_count, updated_count, skipped_count, error_count,
          status, undo_entries_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.edition_id ?? null,
        input.data_type,
        input.file_name,
        input.file_format,
        input.row_count,
        input.inserted_count,
        input.updated_count,
        input.skipped_count,
        input.error_count,
        input.status ?? 'committed',
        input.undo_entries ? JSON.stringify(input.undo_entries) : null,
        ts.created_at,
      );
    return this.assertRow(this.getById(id), 'import_history', id);
  }

  getById(id: string): ImportHistoryRow | null {
    return (
      (this.db.prepare(`SELECT * FROM import_history WHERE id = ?`).get(id) as
        | ImportHistoryRow
        | undefined) ?? null
    );
  }

  getLatest(projectId?: string): ImportHistoryRow | null {
    if (projectId) {
      return (
        (this.db
          .prepare(
            `SELECT * FROM import_history
             WHERE project_id = ? AND status = 'committed'
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(projectId) as ImportHistoryRow | undefined) ?? null
      );
    }
    return (
      (this.db
        .prepare(
          `SELECT * FROM import_history
           WHERE status = 'committed'
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get() as ImportHistoryRow | undefined) ?? null
    );
  }

  listRecent(projectId?: string, limit = 20): ImportHistoryRow[] {
    if (projectId) {
      return this.db
        .prepare(
          `SELECT * FROM import_history
           WHERE project_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(projectId, limit) as ImportHistoryRow[];
    }
    return this.db
      .prepare(`SELECT * FROM import_history ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as ImportHistoryRow[];
  }

  markUndone(id: string): void {
    this.db
      .prepare(`UPDATE import_history SET status = 'undone' WHERE id = ?`)
      .run(id);
  }

  parseUndoEntries(row: ImportHistoryRow): TabularUndoEntry[] {
    if (!row.undo_entries_json) return [];
    try {
      return JSON.parse(row.undo_entries_json) as TabularUndoEntry[];
    } catch {
      return [];
    }
  }
}
