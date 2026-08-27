import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import { normalizeLanguageCode } from '@shared/constants/language-profile';

export const EDITION_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

export interface TranslationEditionRow {
  id: string;
  project_id: string;
  target_language: string;
  name: string;
  status: string;
  style_config: string | null;
  created_at: string;
  updated_at: string;
}

export class TranslationEditionRepository extends BaseRepository {
  create(input: {
    projectId: string;
    targetLanguage: string;
    name: string;
    styleConfig?: string | null;
    status?: EditionStatus;
  }): TranslationEditionRow {
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO translation_editions (
          id, project_id, target_language, name, status, style_config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        normalizeLanguageCode(input.targetLanguage),
        input.name.trim() || normalizeLanguageCode(input.targetLanguage),
        input.status ?? 'ACTIVE',
        input.styleConfig ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.getById(id)!;
  }

  getById(id: string): TranslationEditionRow | null {
    return (
      (this.db.prepare(`SELECT * FROM translation_editions WHERE id = ?`).get(id) as
        | TranslationEditionRow
        | undefined) ?? null
    );
  }

  listByProject(projectId: string): TranslationEditionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_editions
         WHERE project_id = ?
         ORDER BY created_at ASC`,
      )
      .all(projectId) as TranslationEditionRow[];
  }

  getByProjectAndTarget(
    projectId: string,
    targetLanguage: string,
  ): TranslationEditionRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM translation_editions
           WHERE project_id = ? AND target_language = ?`,
        )
        .get(projectId, normalizeLanguageCode(targetLanguage)) as
        | TranslationEditionRow
        | undefined) ?? null
    );
  }

  update(
    id: string,
    patch: {
      name?: string;
      status?: EditionStatus;
      styleConfig?: string | null;
      targetLanguage?: string;
    },
  ): TranslationEditionRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE translation_editions SET
          name = ?,
          status = ?,
          style_config = ?,
          target_language = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.name ?? existing.name,
        patch.status ?? existing.status,
        patch.styleConfig !== undefined ? patch.styleConfig : existing.style_config,
        patch.targetLanguage
          ? normalizeLanguageCode(patch.targetLanguage)
          : existing.target_language,
        utcNow(),
        id,
      );
    return this.getById(id);
  }
}
