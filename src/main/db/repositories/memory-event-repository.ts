import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { MemoryEventCategory, MemorySource } from '@shared/constants/memory';

export interface MemoryEventRow {
  id: string;
  project_id: string;
  category: string;
  event_key: string;
  event_value: string | null;
  source: string;
  locked: number;
  chapter_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMemoryEventInput {
  project_id: string;
  category: MemoryEventCategory;
  event_key: string;
  event_value: string | null;
  source?: MemorySource;
  chapter_number?: number | null;
  locked?: boolean;
}

export class MemoryEventRepository extends BaseRepository {
  getByKey(
    projectId: string,
    category: string,
    eventKey: string,
  ): MemoryEventRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM memory_events WHERE project_id = ? AND category = ? AND event_key = ?`,
        )
        .get(projectId, category, eventKey) as MemoryEventRow | undefined) ?? null
    );
  }

  upsert(input: UpsertMemoryEventInput): MemoryEventRow {
    const existing = this.getByKey(input.project_id, input.category, input.event_key);
    const ts = touchTimestamps();
    if (existing) {
      if (existing.locked === 1) {
        throw new Error('MEMORY_LOCKED');
      }
      this.db
        .prepare(
          `UPDATE memory_events SET event_value = ?, source = ?, chapter_number = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.event_value,
          input.source ?? existing.source,
          input.chapter_number ?? existing.chapter_number,
          ts.updated_at,
          existing.id,
        );
      return this.assertRow(this.getById(existing.id), 'memory_event', existing.id);
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO memory_events (
          id, project_id, category, event_key, event_value, source, locked, chapter_number,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.category,
        input.event_key,
        input.event_value,
        input.source ?? 'manual',
        input.locked ? 1 : 0,
        input.chapter_number ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'memory_event', id);
  }

  getById(id: string): MemoryEventRow | null {
    return (
      (this.db.prepare(`SELECT * FROM memory_events WHERE id = ?`).get(id) as
        | MemoryEventRow
        | undefined) ?? null
    );
  }

  listByProject(projectId: string): MemoryEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_events WHERE project_id = ? ORDER BY updated_at DESC`,
      )
      .all(projectId) as MemoryEventRow[];
  }

  listRecentChapters(
    projectId: string,
    fromChapter: number,
    toChapter: number,
  ): MemoryEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_events
         WHERE project_id = ?
           AND chapter_number IS NOT NULL
           AND chapter_number >= ?
           AND chapter_number <= ?
         ORDER BY chapter_number DESC, updated_at DESC`,
      )
      .all(projectId, fromChapter, toChapter) as MemoryEventRow[];
  }

  listRecent(projectId: string, limit = 50): MemoryEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_events WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(projectId, limit) as MemoryEventRow[];
  }

  countByProject(projectId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM memory_events WHERE project_id = ?`)
      .get(projectId) as { c: number };
    return row.c;
  }

  listOlderThanChapter(projectId: string, beforeChapter: number): MemoryEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_events
         WHERE project_id = ?
           AND chapter_number IS NOT NULL
           AND chapter_number < ?
           AND locked = 0
         ORDER BY chapter_number ASC`,
      )
      .all(projectId, beforeChapter) as MemoryEventRow[];
  }

  deleteByIds(ids: string[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db
      .prepare(`DELETE FROM memory_events WHERE id IN (${placeholders}) AND locked = 0`)
      .run(...ids);
    return result.changes;
  }

  deleteByKey(projectId: string, category: string, eventKey: string): boolean {
    const existing = this.getByKey(projectId, category, eventKey);
    if (!existing) return false;
    if (existing.locked === 1) throw new Error('MEMORY_LOCKED');
    const result = this.db
      .prepare(
        `DELETE FROM memory_events WHERE project_id = ? AND category = ? AND event_key = ?`,
      )
      .run(projectId, category, eventKey);
    return result.changes > 0;
  }

  lock(id: string, locked = true): MemoryEventRow | null {
    this.db
      .prepare(`UPDATE memory_events SET locked = ?, updated_at = ? WHERE id = ?`)
      .run(locked ? 1 : 0, utcNow(), id);
    return this.getById(id);
  }
}
