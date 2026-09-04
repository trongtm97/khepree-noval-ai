import { BaseRepository } from './base-repository';
import { withTransaction } from '../transaction';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { TranslationVersionSource } from '@shared/constants/translation-editor';

export interface TranslationRow {
  id: string;
  paragraph_id: string;
  edition_id: string | null;
  translated_text: string | null;
  status: string;
  provider: string | null;
  model: string | null;
  metadata: string | null;
  human_locked: number;
  version_source: string;
  created_at: string;
  updated_at: string;
}

export interface TranslationVersionRow {
  id: string;
  translation_id: string;
  version: number;
  translated_text: string | null;
  status: string;
  provider: string | null;
  model: string | null;
  metadata: string | null;
  version_source: string;
  editor_note: string | null;
  created_at: string;
}

export interface CreateTranslationInput {
  paragraph_id: string;
  edition_id?: string | null;
  translated_text?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  metadata?: string | null;
  version_source?: TranslationVersionSource;
  human_locked?: boolean;
}

export interface UpsertTranslationInput {
  paragraph_id: string;
  edition_id?: string | null;
  translated_text: string | null;
  status?: string;
  version_source: TranslationVersionSource;
  human_locked?: boolean;
  editor_note?: string | null;
  /** Skip update when existing row is human_locked (AI batch). */
  respectHumanLock?: boolean;
}

export class TranslationRepository extends BaseRepository {
  create(input: CreateTranslationInput): TranslationRow {
    const id = newId();
    const ts = touchTimestamps();
    const versionSource = input.version_source ?? 'AI_INITIAL';

    this.db
      .prepare(
        `INSERT INTO translations (
          id, paragraph_id, edition_id, translated_text, status, provider, model, metadata,
          human_locked, version_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.paragraph_id,
        input.edition_id ?? null,
        input.translated_text ?? null,
        input.status ?? 'pending',
        input.provider ?? null,
        input.model ?? null,
        input.metadata ?? null,
        input.human_locked ? 1 : 0,
        versionSource,
        ts.created_at,
        ts.updated_at,
      );

    this.insertVersion({
      translation_id: id,
      version: 1,
      translated_text: input.translated_text ?? null,
      status: input.status ?? 'pending',
      provider: input.provider ?? null,
      model: input.model ?? null,
      metadata: input.metadata ?? null,
      version_source: versionSource,
      editor_note: null,
      created_at: ts.created_at,
    });

    return this.assertRow(this.getById(id), 'translation', id);
  }

  getById(id: string): TranslationRow | null {
    return (
      (this.db.prepare(`SELECT * FROM translations WHERE id = ?`).get(id) as
        | TranslationRow
        | undefined) ?? null
    );
  }

  getByParagraphId(
    paragraphUuid: string,
    editionId?: string | null,
  ): TranslationRow | null {
    if (editionId) {
      return (
        (this.db
          .prepare(
            `SELECT * FROM translations WHERE paragraph_id = ? AND edition_id = ?`,
          )
          .get(paragraphUuid, editionId) as TranslationRow | undefined) ?? null
      );
    }
    return (
      (this.db
        .prepare(
          `SELECT * FROM translations WHERE paragraph_id = ?
           ORDER BY CASE WHEN edition_id IS NULL THEN 1 ELSE 0 END, updated_at DESC
           LIMIT 1`,
        )
        .get(paragraphUuid) as TranslationRow | undefined) ?? null
    );
  }

  listByChapter(chapterUuid: string, editionId?: string | null): TranslationRow[] {
    if (editionId) {
      return this.db
        .prepare(
          `SELECT t.* FROM translations t
           INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
           WHERE p.chapter_id = ? AND t.edition_id = ?
           ORDER BY p.sequence ASC`,
        )
        .all(chapterUuid, editionId) as TranslationRow[];
    }
    return this.db
      .prepare(
        `SELECT t.* FROM translations t
         INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
         WHERE p.chapter_id = ?
         ORDER BY p.sequence ASC`,
      )
      .all(chapterUuid) as TranslationRow[];
  }

  /**
   * Upsert translation with version history.
   * When respectHumanLock and row human_locked → returns existing unchanged.
   */
  upsert(input: UpsertTranslationInput): { row: TranslationRow; skipped: boolean } {
    const existing = this.getByParagraphId(input.paragraph_id, input.edition_id);
    if (existing && input.respectHumanLock && existing.human_locked === 1) {
      return { row: existing, skipped: true };
    }

    if (!existing) {
      const row = this.create({
        paragraph_id: input.paragraph_id,
        edition_id: input.edition_id ?? null,
        translated_text: input.translated_text,
        status: input.status ?? 'translated',
        version_source: input.version_source,
        human_locked: input.human_locked ?? input.version_source === 'HUMAN_EDIT',
      });
      return { row, skipped: false };
    }

    const row = this.appendVersion(existing.id, {
      translated_text: input.translated_text,
      status: input.status ?? existing.status,
      version_source: input.version_source,
      human_locked:
        input.human_locked ??
        (input.version_source === 'HUMAN_EDIT' ? true : existing.human_locked === 1),
      editor_note: input.editor_note ?? null,
    });
    return { row: row ?? existing, skipped: false };
  }

  saveHumanEdit(
    paragraphUuid: string,
    translatedText: string,
    editionId?: string | null,
  ): TranslationRow {
    const existing = this.getByParagraphId(paragraphUuid, editionId);
    if (!existing) {
      return this.create({
        paragraph_id: paragraphUuid,
        edition_id: editionId ?? null,
        translated_text: translatedText,
        status: 'reviewed',
        version_source: 'HUMAN_EDIT',
        human_locked: true,
      });
    }
    return (
      this.appendVersion(existing.id, {
        translated_text: translatedText,
        status: 'reviewed',
        version_source: 'HUMAN_EDIT',
        human_locked: true,
        editor_note: 'Manual edit',
      }) ?? existing
    );
  }

  appendVersion(
    translationId: string,
    patch: {
      translated_text: string | null;
      status: string;
      version_source: TranslationVersionSource;
      human_locked: boolean;
      editor_note?: string | null;
      provider?: string | null;
      model?: string | null;
      metadata?: string | null;
    },
  ): TranslationRow | null {
    const existing = this.getById(translationId);
    if (!existing) return null;

    return withTransaction(this.db, () => {
      const versionRow = this.db
        .prepare(
          `SELECT COALESCE(MAX(version), 0) AS max_version FROM translation_versions WHERE translation_id = ?`,
        )
        .get(translationId) as { max_version: number };
      const nextVersion = versionRow.max_version + 1;
      const now = utcNow();

      this.db
        .prepare(
          `UPDATE translations SET
          translated_text = ?,
          status = ?,
          version_source = ?,
          human_locked = ?,
          provider = COALESCE(?, provider),
          model = COALESCE(?, model),
          metadata = COALESCE(?, metadata),
          updated_at = ?
        WHERE id = ?`,
        )
        .run(
          patch.translated_text,
          patch.status,
          patch.version_source,
          patch.human_locked ? 1 : 0,
          patch.provider ?? null,
          patch.model ?? null,
          patch.metadata ?? null,
          now,
          translationId,
        );

      this.insertVersion({
        translation_id: translationId,
        version: nextVersion,
        translated_text: patch.translated_text,
        status: patch.status,
        provider: patch.provider ?? existing.provider,
        model: patch.model ?? existing.model,
        metadata: patch.metadata ?? existing.metadata,
        version_source: patch.version_source,
        editor_note: patch.editor_note ?? null,
        created_at: now,
      });

      return this.getById(translationId);
    });
  }

  revertToVersion(translationId: string, version: number): TranslationRow | null {
    const ver = this.getVersion(translationId, version);
    if (!ver) return null;
    const humanLocked = ver.version_source === 'HUMAN_EDIT' ? 1 : 0;
    return this.appendVersion(translationId, {
      translated_text: ver.translated_text,
      status: ver.status,
      version_source: ver.version_source as TranslationVersionSource,
      human_locked: humanLocked === 1,
      editor_note: `Reverted to v${version}`,
    });
  }

  listVersions(translationId: string): TranslationVersionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM translation_versions WHERE translation_id = ? ORDER BY version DESC`,
      )
      .all(translationId) as TranslationVersionRow[];
  }

  getVersion(translationId: string, version: number): TranslationVersionRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM translation_versions WHERE translation_id = ? AND version = ?`,
        )
        .get(translationId, version) as TranslationVersionRow | undefined) ?? null
    );
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM translations WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /** All paragraphs for project/edition joined with optional translation — for spreadsheet export. */
  listSpreadsheetRows(
    projectId: string,
    editionId: string,
  ): {
    project_id: string;
    edition_id: string;
    chapter_number: number | null;
    chapter_title: string | null;
    paragraph_uuid: string;
    paragraph_id: string;
    source_text: string;
    translation_id: string | null;
    translated_text: string | null;
    translation_status: string | null;
    human_locked: number | null;
    updated_at: string | null;
    editor_note: string | null;
  }[] {
    return this.db
      .prepare(
        `SELECT
          c.project_id,
          ? AS edition_id,
          c.chapter_number,
          COALESCE(c.chapter_title, c.display_title) AS chapter_title,
          p.id AS paragraph_uuid,
          p.paragraph_id,
          p.source_text,
          t.id AS translation_id,
          t.translated_text,
          t.status AS translation_status,
          t.human_locked,
          t.updated_at,
          (
            SELECT tv.editor_note FROM translation_versions tv
            WHERE tv.translation_id = t.id
            ORDER BY tv.version DESC LIMIT 1
          ) AS editor_note
        FROM chapter_paragraphs p
        INNER JOIN chapters c ON c.id = p.chapter_id
        LEFT JOIN translations t ON t.paragraph_id = p.id AND t.edition_id = ?
        WHERE c.project_id = ?
        ORDER BY c.sequence_order ASC, p.sequence ASC`,
      )
      .all(editionId, editionId, projectId) as {
      project_id: string;
      edition_id: string;
      chapter_number: number | null;
      chapter_title: string | null;
      paragraph_uuid: string;
      paragraph_id: string;
      source_text: string;
      translation_id: string | null;
      translated_text: string | null;
      translation_status: string | null;
      human_locked: number | null;
      updated_at: string | null;
      editor_note: string | null;
    }[];
  }

  /**
   * Delete AI translations for a chapter; keep human_locked rows.
   * Version history cascades via FK ON DELETE CASCADE.
   */
  clearAiByChapter(
    chapterUuid: string,
    editionId?: string | null,
  ): { deleted: number; keptLocked: number } {
    const locked = this.db
      .prepare(
        editionId
          ? `SELECT COUNT(*) AS c FROM translations t
             INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
             WHERE p.chapter_id = ? AND t.edition_id = ? AND t.human_locked = 1`
          : `SELECT COUNT(*) AS c FROM translations t
             INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
             WHERE p.chapter_id = ? AND t.human_locked = 1`,
      )
      .get(...(editionId ? [chapterUuid, editionId] : [chapterUuid])) as { c: number };

    const result = this.db
      .prepare(
        editionId
          ? `DELETE FROM translations WHERE id IN (
               SELECT t.id FROM translations t
               INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
               WHERE p.chapter_id = ? AND t.edition_id = ? AND COALESCE(t.human_locked, 0) = 0
             )`
          : `DELETE FROM translations WHERE id IN (
               SELECT t.id FROM translations t
               INNER JOIN chapter_paragraphs p ON p.id = t.paragraph_id
               WHERE p.chapter_id = ? AND COALESCE(t.human_locked, 0) = 0
             )`,
      )
      .run(...(editionId ? [chapterUuid, editionId] : [chapterUuid]));

    return { deleted: result.changes, keptLocked: locked.c };
  }

  private insertVersion(input: {
    translation_id: string;
    version: number;
    translated_text: string | null;
    status: string;
    provider: string | null;
    model: string | null;
    metadata: string | null;
    version_source: TranslationVersionSource;
    editor_note: string | null;
    created_at: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO translation_versions (
          id, translation_id, version, translated_text, status, provider, model, metadata,
          version_source, editor_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        input.translation_id,
        input.version,
        input.translated_text,
        input.status,
        input.provider,
        input.model,
        input.metadata,
        input.version_source,
        input.editor_note,
        input.created_at,
      );
  }
}
