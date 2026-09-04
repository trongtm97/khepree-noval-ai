import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { LibrarySearchEntityType } from '@shared/constants/library-search';

export interface LibrarySearchFtsRow {
  entity_key: string;
  entity_type: string;
  project_id: string | null;
  series_id: string | null;
  status: string | null;
  language: string | null;
  body: string;
}

export interface LibrarySearchDirtyRow {
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  created_at: string;
}

export interface LibrarySearchIndexRunRow {
  id: string;
  status: string;
  phase: string | null;
  last_entity_key: string | null;
  entities_total: number;
  entities_done: number;
  error_message: string | null;
  checkpoint_json: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface LibrarySearchQueryFilters {
  projectIds?: string[];
  seriesIds?: string[];
  entityTypes?: LibrarySearchEntityType[];
  statuses?: string[];
  languages?: string[];
}

export class LibrarySearchRepository extends BaseRepository {
  upsertFtsRow(row: LibrarySearchFtsRow): void {
    this.db
      .prepare(`DELETE FROM library_search_fts WHERE entity_key = ?`)
      .run(row.entity_key);
    if (!row.body.trim()) return;
    this.db
      .prepare(
        `INSERT INTO library_search_fts
         (entity_key, entity_type, project_id, series_id, status, language, body)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.entity_key,
        row.entity_type,
        row.project_id,
        row.series_id,
        row.status,
        row.language,
        row.body,
      );
  }

  deleteFtsByEntityKey(entityKey: string): void {
    this.db.prepare(`DELETE FROM library_search_fts WHERE entity_key = ?`).run(entityKey);
  }

  deleteFtsByProject(projectId: string): void {
    this.db.prepare(`DELETE FROM library_search_fts WHERE project_id = ?`).run(projectId);
  }

  countFtsRows(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM library_search_fts`)
      .get() as { c: number };
    return row.c;
  }

  rebuildFtsIndex(): void {
    this.db.prepare(`INSERT INTO library_search_fts(library_search_fts) VALUES ('rebuild')`).run();
  }

  searchFts(input: {
    ftsQuery: string;
    limit: number;
    offset: number;
    filters: LibrarySearchQueryFilters;
  }): { rows: Array<LibrarySearchFtsRow & { snippet: string; rank: number }>; total: number } {
    const clauses: string[] = ['library_search_fts MATCH ?'];
    const params: unknown[] = [input.ftsQuery];

    if (input.filters.projectIds && input.filters.projectIds.length > 0) {
      clauses.push(`project_id IN (${input.filters.projectIds.map(() => '?').join(',')})`);
      params.push(...input.filters.projectIds);
    }
    if (input.filters.seriesIds && input.filters.seriesIds.length > 0) {
      clauses.push(`series_id IN (${input.filters.seriesIds.map(() => '?').join(',')})`);
      params.push(...input.filters.seriesIds);
    }
    if (input.filters.entityTypes && input.filters.entityTypes.length > 0) {
      clauses.push(`entity_type IN (${input.filters.entityTypes.map(() => '?').join(',')})`);
      params.push(...input.filters.entityTypes);
    }
    if (input.filters.statuses && input.filters.statuses.length > 0) {
      clauses.push(`status IN (${input.filters.statuses.map(() => '?').join(',')})`);
      params.push(...input.filters.statuses);
    }
    if (input.filters.languages && input.filters.languages.length > 0) {
      clauses.push(`language IN (${input.filters.languages.map(() => '?').join(',')})`);
      params.push(...input.filters.languages);
    }

    const where = clauses.join(' AND ');
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM library_search_fts WHERE ${where}`)
      .get(...params) as { c: number };

    const rows = this.db
      .prepare(
        `SELECT entity_key, entity_type, project_id, series_id, status, language, body,
          snippet(library_search_fts, 0, '〈', '〉', '…', 48) AS snippet,
          bm25(library_search_fts) AS rank
         FROM library_search_fts
         WHERE ${where}
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(...params, input.limit, input.offset) as Array<
      LibrarySearchFtsRow & { snippet: string; rank: number }
    >;

    return { rows, total: countRow.c };
  }

  enqueueDirty(entityType: string, entityId: string, projectId?: string | null): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(entityType, entityId, projectId ?? null, utcNow());
  }

  listDirty(limit: number): LibrarySearchDirtyRow[] {
    return this.db
      .prepare(
        `SELECT * FROM library_search_dirty ORDER BY created_at ASC LIMIT ?`,
      )
      .all(limit) as LibrarySearchDirtyRow[];
  }

  clearDirty(entityType: string, entityId: string): void {
    this.db
      .prepare(`DELETE FROM library_search_dirty WHERE entity_type = ? AND entity_id = ?`)
      .run(entityType, entityId);
  }

  clearAllDirty(): void {
    this.db.prepare(`DELETE FROM library_search_dirty`).run();
  }

  createIndexRun(): LibrarySearchIndexRunRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO library_search_index_runs
         (id, status, phase, last_entity_key, entities_total, entities_done,
          error_message, checkpoint_json, created_at, updated_at, finished_at)
         VALUES (?, 'PENDING', 'queued', NULL, 0, 0, NULL, NULL, ?, ?, NULL)`,
      )
      .run(id, ts.created_at, ts.updated_at);
    return this.getIndexRunById(id)!;
  }

  getIndexRunById(id: string): LibrarySearchIndexRunRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM library_search_index_runs WHERE id = ?`)
        .get(id) as LibrarySearchIndexRunRow | undefined) ?? null
    );
  }

  getActiveIndexRun(): LibrarySearchIndexRunRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM library_search_index_runs
           WHERE status IN ('PENDING', 'RUNNING', 'PAUSED')
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get() as LibrarySearchIndexRunRow | undefined) ?? null
    );
  }

  updateIndexRun(
    id: string,
    patch: Partial<{
      status: string;
      phase: string | null;
      lastEntityKey: string | null;
      entitiesTotal: number;
      entitiesDone: number;
      errorMessage: string | null;
      checkpointJson: string | null;
      finishedAt: string | null;
    }>,
  ): LibrarySearchIndexRunRow | null {
    const now = utcNow();
    const fields: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (patch.status !== undefined) {
      fields.push('status = ?');
      params.push(patch.status);
    }
    if (patch.phase !== undefined) {
      fields.push('phase = ?');
      params.push(patch.phase);
    }
    if (patch.lastEntityKey !== undefined) {
      fields.push('last_entity_key = ?');
      params.push(patch.lastEntityKey);
    }
    if (patch.entitiesTotal !== undefined) {
      fields.push('entities_total = ?');
      params.push(patch.entitiesTotal);
    }
    if (patch.entitiesDone !== undefined) {
      fields.push('entities_done = ?');
      params.push(patch.entitiesDone);
    }
    if (patch.errorMessage !== undefined) {
      fields.push('error_message = ?');
      params.push(patch.errorMessage);
    }
    if (patch.checkpointJson !== undefined) {
      fields.push('checkpoint_json = ?');
      params.push(patch.checkpointJson);
    }
    if (patch.finishedAt !== undefined) {
      fields.push('finished_at = ?');
      params.push(patch.finishedAt);
    }

    params.push(id);
    this.db
      .prepare(`UPDATE library_search_index_runs SET ${fields.join(', ')} WHERE id = ?`)
      .run(...params);
    return this.getIndexRunById(id);
  }
}
