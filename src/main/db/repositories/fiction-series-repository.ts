import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface FictionSeriesRow {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FictionSeriesVolumeRow {
  id: string;
  series_id: string;
  project_id: string;
  volume_order: number;
  volume_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesStyleRuleRow {
  id: string;
  series_id: string;
  rule_kind: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SeriesWorldStateRow {
  series_id: string;
  world_knowledge_json: string | null;
  updated_at: string;
}

export class FictionSeriesRepository extends BaseRepository {
  createSeries(input: {
    title: string;
    description?: string | null;
    genre?: string | null;
  }): FictionSeriesRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO fiction_series (id, title, description, genre, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        input.title.trim(),
        input.description ?? null,
        input.genre ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getSeriesById(id), 'fiction_series', id);
  }

  getSeriesById(id: string): FictionSeriesRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM fiction_series WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as FictionSeriesRow | undefined) ?? null
    );
  }

  listSeries(limit = 200): FictionSeriesRow[] {
    return this.db
      .prepare(
        `SELECT * FROM fiction_series WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(limit) as FictionSeriesRow[];
  }

  updateSeries(
    id: string,
    patch: Partial<Pick<FictionSeriesRow, 'title' | 'description' | 'genre'>>,
  ): FictionSeriesRow | null {
    const existing = this.getSeriesById(id);
    if (!existing) return null;
    const updated_at = utcNow();
    this.db
      .prepare(
        `UPDATE fiction_series SET
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          genre = COALESCE(?, genre),
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.title ?? null,
        patch.description ?? null,
        patch.genre ?? null,
        updated_at,
        id,
      );
    return this.getSeriesById(id);
  }

  softDeleteSeries(id: string): void {
    this.db
      .prepare(`UPDATE fiction_series SET deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(utcNow(), utcNow(), id);
  }

  getVolumeByProject(projectId: string): FictionSeriesVolumeRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM fiction_series_volumes WHERE project_id = ? LIMIT 1`)
        .get(projectId) as FictionSeriesVolumeRow | undefined) ?? null
    );
  }

  listVolumes(seriesId: string): FictionSeriesVolumeRow[] {
    return this.db
      .prepare(
        `SELECT * FROM fiction_series_volumes WHERE series_id = ? ORDER BY volume_order ASC, created_at ASC`,
      )
      .all(seriesId) as FictionSeriesVolumeRow[];
  }

  addVolume(input: {
    seriesId: string;
    projectId: string;
    volumeOrder?: number;
    volumeLabel?: string | null;
  }): FictionSeriesVolumeRow {
    const existing = this.getVolumeByProject(input.projectId);
    if (existing) {
      throw new Error('PROJECT_ALREADY_IN_SERIES');
    }
    const volumes = this.listVolumes(input.seriesId);
    const volumeOrder =
      input.volumeOrder ?? (volumes.length > 0 ? Math.max(...volumes.map((v) => v.volume_order)) + 1 : 1);
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO fiction_series_volumes
         (id, series_id, project_id, volume_order, volume_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.seriesId,
        input.projectId,
        volumeOrder,
        input.volumeLabel ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getVolumeById(id), 'fiction_series_volumes', id);
  }

  getVolumeById(id: string): FictionSeriesVolumeRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM fiction_series_volumes WHERE id = ?`)
        .get(id) as FictionSeriesVolumeRow | undefined) ?? null
    );
  }

  /** Remove membership only — project data untouched. */
  removeVolumeMembership(seriesId: string, projectId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM fiction_series_volumes WHERE series_id = ? AND project_id = ?`)
      .run(seriesId, projectId);
    return result.changes > 0;
  }

  reorderVolumes(seriesId: string, orderedProjectIds: string[]): void {
    const now = utcNow();
    for (let i = 0; i < orderedProjectIds.length; i += 1) {
      this.db
        .prepare(
          `UPDATE fiction_series_volumes SET volume_order = ?, updated_at = ?
           WHERE series_id = ? AND project_id = ?`,
        )
        .run(i + 1, now, seriesId, orderedProjectIds[i]);
    }
  }

  listStyleRules(seriesId: string): SeriesStyleRuleRow[] {
    return this.db
      .prepare(
        `SELECT * FROM series_style_rules WHERE series_id = ? ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(seriesId) as SeriesStyleRuleRow[];
  }

  upsertStyleRule(input: {
    id?: string;
    seriesId: string;
    ruleKind: string;
    content: string;
    sortOrder?: number;
  }): SeriesStyleRuleRow {
    const ts = touchTimestamps();
    const id = input.id ?? newId();
    const existing = this.db
      .prepare(`SELECT id FROM series_style_rules WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE series_style_rules SET rule_kind = ?, content = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        )
        .run(input.ruleKind, input.content, input.sortOrder ?? 0, ts.updated_at, id);
    } else {
      this.db
        .prepare(
          `INSERT INTO series_style_rules
           (id, series_id, rule_kind, content, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.seriesId,
          input.ruleKind,
          input.content,
          input.sortOrder ?? 0,
          ts.created_at,
          ts.updated_at,
        );
    }
    return this.db
      .prepare(`SELECT * FROM series_style_rules WHERE id = ?`)
      .get(id) as SeriesStyleRuleRow;
  }

  deleteStyleRule(id: string): void {
    this.db.prepare(`DELETE FROM series_style_rules WHERE id = ?`).run(id);
  }

  getWorldState(seriesId: string): SeriesWorldStateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM series_world_states WHERE series_id = ?`)
        .get(seriesId) as SeriesWorldStateRow | undefined) ?? null
    );
  }

  setWorldKnowledgeJson(seriesId: string, json: string | null): SeriesWorldStateRow {
    const now = utcNow();
    const existing = this.getWorldState(seriesId);
    if (existing) {
      this.db
        .prepare(`UPDATE series_world_states SET world_knowledge_json = ?, updated_at = ? WHERE series_id = ?`)
        .run(json, now, seriesId);
    } else {
      this.db
        .prepare(
          `INSERT INTO series_world_states (series_id, world_knowledge_json, updated_at) VALUES (?, ?, ?)`,
        )
        .run(seriesId, json, now);
    }
    return this.getWorldState(seriesId)!;
  }
}

export function createFictionSeriesRepository(db: Database.Database): FictionSeriesRepository {
  return new FictionSeriesRepository(db);
}
