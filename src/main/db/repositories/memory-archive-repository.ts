import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export interface MemoryArchiveRow {
  id: string;
  project_id: string;
  archive_kind: string;
  chapter_from: number | null;
  chapter_to: number | null;
  content_json: string;
  item_count: number;
  created_at: string;
}

export class MemoryArchiveRepository extends BaseRepository {
  create(input: {
    project_id: string;
    archive_kind: string;
    chapter_from?: number | null;
    chapter_to?: number | null;
    content_json: string;
    item_count?: number;
  }): MemoryArchiveRow {
    const id = newId();
    const createdAt = utcNow();
    this.db
      .prepare(
        `INSERT INTO memory_archives (
          id, project_id, archive_kind, chapter_from, chapter_to, content_json, item_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.archive_kind,
        input.chapter_from ?? null,
        input.chapter_to ?? null,
        input.content_json,
        input.item_count ?? 0,
        createdAt,
      );
    return this.assertRow(this.getById(id), 'memory_archive', id);
  }

  getById(id: string): MemoryArchiveRow | null {
    return (
      (this.db.prepare(`SELECT * FROM memory_archives WHERE id = ?`).get(id) as
        | MemoryArchiveRow
        | undefined) ?? null
    );
  }

  listByProject(projectId: string, limit = 50): MemoryArchiveRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_archives WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(projectId, limit) as MemoryArchiveRow[];
  }
}
