import type { TermScope, TermStatus, TermType } from '@shared/constants/term';
import { normalizeTermType } from '@shared/constants/term';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  normalizeLanguageCode,
} from '@shared/constants/language-profile';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import { stringifyJsonStringArray } from '../../terms/term-variant-json';

export interface TermRow {
  id: string;
  /** Logical source text (pair-scoped). Mirrors source_simplified for legacy. */
  source_text: string | null;
  source_simplified: string;
  source_traditional: string | null;
  pinyin: string | null;
  source_language: string;
  target_language: string;
  source_variants: string | null;
  target_variants: string | null;
  transliteration: string | null;
  transliteration_system: string | null;
  term_type: string;
  genre: string | null;
  scope: string;
  scope_ref: string | null;
  status: string;
  confidence: number | null;
  occurrence_count: number;
  novel_count: number;
  project_count: number;
  locked: number;
  meaning: string | null;
  notes: string | null;
  human_confirm_count: number;
  first_seen_chapter: number | null;
  discovered_from_chapter: number | null;
  future_sensitive: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TermTranslationRow {
  id: string;
  term_id: string;
  target_text: string;
  target_language: string | null;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

export interface LanguagePairFilter {
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface CreateTermInput {
  source_text?: string;
  source_simplified?: string;
  source_traditional?: string | null;
  pinyin?: string | null;
  source_language?: string;
  target_language?: string;
  source_variants?: string[] | null;
  target_variants?: string[] | null;
  transliteration?: string | null;
  transliteration_system?: string | null;
  term_type?: TermType;
  genre?: string | null;
  scope: TermScope;
  scope_ref?: string | null;
  status?: TermStatus;
  confidence?: number | null;
  preferred_translation?: string;
  target_text?: string;
  alternative_translations?: string[];
  meaning?: string | null;
  notes?: string | null;
  locked?: boolean;
}

export interface UpdateTermInput {
  source_text?: string;
  source_simplified?: string;
  source_traditional?: string | null;
  pinyin?: string | null;
  source_language?: string;
  target_language?: string;
  source_variants?: string[] | null;
  target_variants?: string[] | null;
  transliteration?: string | null;
  transliteration_system?: string | null;
  term_type?: TermType;
  genre?: string | null;
  scope?: TermScope;
  scope_ref?: string | null;
  status?: TermStatus;
  confidence?: number | null;
  preferred_translation?: string;
  alternative_translations?: string[];
  meaning?: string | null;
  notes?: string | null;
  locked?: boolean;
}

export interface TermSearchFilters {
  chinese?: string;
  vietnamese?: string;
  sourceText?: string;
  targetText?: string;
  pinyin?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  termType?: TermType;
  scope?: TermScope;
  scopeRef?: string;
  status?: TermStatus;
  genre?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}

export interface TermSearchResult {
  term_id: string;
  rank: number;
}

function resolveSourceText(input: {
  source_text?: string;
  source_simplified?: string;
}): string {
  return (input.source_text ?? input.source_simplified ?? '').trim();
}

function syncChineseLegacy(input: {
  source_traditional?: string | null;
  pinyin?: string | null;
  transliteration?: string | null;
  transliteration_system?: string | null;
  source_variants?: string[] | null;
  source_language?: string;
}): {
  traditional: string | null | undefined;
  pinyin: string | null | undefined;
  transliteration: string | null | undefined;
  transliterationSystem: string | null | undefined;
  sourceVariantsJson: string | null | undefined;
} {
  const isZh = (input.source_language ?? DEFAULT_SOURCE_LANGUAGE)
    .toLowerCase()
    .startsWith('zh');
  let traditional = input.source_traditional;
  let pinyin = input.pinyin;
  let transliteration = input.transliteration;
  let transliterationSystem = input.transliteration_system;
  let variants = input.source_variants;

  if (isZh) {
    if (transliteration === undefined && pinyin !== undefined) {
      transliteration = pinyin;
      if (transliterationSystem === undefined && pinyin) {
        transliterationSystem = 'pinyin';
      }
    }
    if (pinyin === undefined && transliteration !== undefined) {
      transliterationSystem = transliterationSystem ?? 'pinyin';
      pinyin = transliteration;
    }
    if (variants === undefined && traditional?.trim()) {
      variants = [traditional.trim()];
    }
    if (
      traditional === undefined &&
      variants &&
      variants.length > 0
    ) {
      traditional = variants[0] ?? null;
    }
  }

  return {
    traditional,
    pinyin,
    transliteration,
    transliterationSystem,
    sourceVariantsJson:
      variants !== undefined ? stringifyJsonStringArray(variants ?? []) : undefined,
  };
}

export class TermRepository extends BaseRepository {
  create(input: CreateTermInput): TermRow {
    const id = newId();
    const ts = touchTimestamps();
    const termType = normalizeTermType(input.term_type ?? 'OTHER');
    const sourceText = resolveSourceText(input);
    if (!sourceText) throw new Error('Term source_text is required');
    const sourceLanguage = normalizeLanguageCode(
      input.source_language ?? DEFAULT_SOURCE_LANGUAGE,
    );
    const targetLanguage = normalizeLanguageCode(
      input.target_language ?? DEFAULT_TARGET_LANGUAGE,
    );
    const legacy = syncChineseLegacy({
      ...input,
      source_language: sourceLanguage,
    });

    this.db
      .prepare(
        `INSERT INTO terms (
          id, source_text, source_simplified, source_traditional, pinyin,
          source_language, target_language, source_variants, target_variants,
          transliteration, transliteration_system,
          term_type, genre, scope, scope_ref, status, confidence,
          occurrence_count, novel_count, project_count, locked, meaning, notes,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        sourceText,
        sourceText,
        legacy.traditional ?? null,
        legacy.pinyin ?? null,
        sourceLanguage,
        targetLanguage,
        legacy.sourceVariantsJson ?? null,
        input.target_variants !== undefined
          ? stringifyJsonStringArray(input.target_variants ?? [])
          : null,
        legacy.transliteration ?? null,
        legacy.transliterationSystem ?? null,
        termType,
        input.genre ?? null,
        input.scope,
        input.scope_ref ?? null,
        input.status ?? 'DISCOVERED',
        input.confidence ?? null,
        input.locked ? 1 : 0,
        input.meaning ?? null,
        input.notes ?? null,
        ts.created_at,
        ts.updated_at,
      );

    if (input.preferred_translation ?? input.target_text) {
      this.setTranslations(
        id,
        input.preferred_translation ?? input.target_text ?? '',
        input.alternative_translations ?? [],
        targetLanguage,
      );
    }

    return this.assertRow(this.getById(id), 'term', id);
  }

  getById(id: string): TermRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM terms WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as TermRow | undefined) ?? null
    );
  }

  getBySourceAndScope(
    source: string,
    scope: TermScope,
    scopeRef?: string | null,
    pair?: LanguagePairFilter,
  ): TermRow | null {
    const sourceLanguage = normalizeLanguageCode(
      pair?.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
    );
    const targetLanguage = normalizeLanguageCode(
      pair?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
    );
    const row = scopeRef
      ? (this.db
          .prepare(
            `SELECT * FROM terms
             WHERE (source_text = ? OR source_simplified = ?)
               AND scope = ? AND scope_ref = ?
               AND source_language = ? AND target_language = ?
               AND deleted_at IS NULL
             LIMIT 1`,
          )
          .get(
            source,
            source,
            scope,
            scopeRef,
            sourceLanguage,
            targetLanguage,
          ) as TermRow | undefined)
      : (this.db
          .prepare(
            `SELECT * FROM terms
             WHERE (source_text = ? OR source_simplified = ?)
               AND scope = ? AND scope_ref IS NULL
               AND source_language = ? AND target_language = ?
               AND deleted_at IS NULL
             LIMIT 1`,
          )
          .get(source, source, scope, sourceLanguage, targetLanguage) as
            | TermRow
            | undefined);
    return row ?? null;
  }

  /**
   * Find term for a language pair.
   * When projectId is set and pair omitted, uses the project's source/target languages.
   */
  findBySource(
    sourceText: string,
    projectId?: string,
    pair?: LanguagePairFilter,
  ): TermRow | null {
    let sourceLanguage = pair?.sourceLanguage;
    let targetLanguage = pair?.targetLanguage;
    if ((!sourceLanguage || !targetLanguage) && projectId) {
      const project = this.db
        .prepare(`SELECT source_language, target_language FROM projects WHERE id = ?`)
        .get(projectId) as
        | { source_language: string; target_language: string }
        | undefined;
      sourceLanguage ??= project?.source_language;
      targetLanguage ??= project?.target_language;
    }
    sourceLanguage = normalizeLanguageCode(sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE);
    targetLanguage = normalizeLanguageCode(targetLanguage ?? DEFAULT_TARGET_LANGUAGE);
    if (projectId) {
      const projectScoped = this.db
        .prepare(
          `SELECT * FROM terms
           WHERE (source_text = ? OR source_simplified = ?)
             AND source_language = ? AND target_language = ?
             AND deleted_at IS NULL
             AND (
               (scope = 'PROJECT' AND scope_ref = ?)
               OR id IN (SELECT term_id FROM project_terms WHERE project_id = ?)
             )
           ORDER BY
             CASE status
               WHEN 'LOCKED' THEN 0
               WHEN 'GLOBAL_VERIFIED' THEN 1
               WHEN 'GENRE_VERIFIED' THEN 2
               WHEN 'PROJECT_VERIFIED' THEN 3
               WHEN 'CANDIDATE' THEN 4
               ELSE 5
             END
           LIMIT 1`,
        )
        .get(
          sourceText,
          sourceText,
          sourceLanguage,
          targetLanguage,
          projectId,
          projectId,
        ) as TermRow | undefined;
      if (projectScoped) return projectScoped;
    }
    return (
      (this.db
        .prepare(
          `SELECT * FROM terms
           WHERE (source_text = ? OR source_simplified = ?)
             AND source_language = ? AND target_language = ?
             AND deleted_at IS NULL
           ORDER BY occurrence_count DESC LIMIT 1`,
        )
        .get(sourceText, sourceText, sourceLanguage, targetLanguage) as
          | TermRow
          | undefined) ?? null
    );
  }

  setConfidence(id: string, confidence: number): TermRow | null {
    this.db
      .prepare(`UPDATE terms SET confidence = ?, updated_at = ? WHERE id = ?`)
      .run(confidence, utcNow(), id);
    return this.getById(id);
  }

  bumpHumanConfirm(id: string): TermRow | null {
    this.db
      .prepare(
        `UPDATE terms SET human_confirm_count = human_confirm_count + 1, updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), id);
    return this.getById(id);
  }

  listByScope(scope: TermScope, scopeRef?: string | null): TermRow[] {
    if (scopeRef !== undefined && scopeRef !== null) {
      return this.db
        .prepare(
          `SELECT * FROM terms WHERE scope = ? AND scope_ref = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
        )
        .all(scope, scopeRef) as TermRow[];
    }
    return this.db
      .prepare(
        `SELECT * FROM terms WHERE scope = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      )
      .all(scope) as TermRow[];
  }

  /** All active terms for matcher (optionally filtered by project/genre/language pair). */
  listForMatching(context: {
    projectId?: string;
    genre?: string | null;
    userId?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
  }): TermRow[] {
    const clauses = [`deleted_at IS NULL`, `status != 'REJECTED'`];
    const params: unknown[] = [];

    if (context.projectId) {
      clauses.push(
        `(scope = 'GLOBAL' OR scope = 'GENRE' OR scope = 'USER' OR scope = 'CONTEXT' OR (scope = 'PROJECT' AND scope_ref = ?))`,
      );
      params.push(context.projectId);
    } else {
      clauses.push(`scope IN ('GLOBAL', 'GENRE', 'USER')`);
    }

    if (context.sourceLanguage) {
      clauses.push(`source_language = ?`);
      params.push(normalizeLanguageCode(context.sourceLanguage));
    }
    if (context.targetLanguage) {
      clauses.push(`target_language = ?`);
      params.push(normalizeLanguageCode(context.targetLanguage));
    }

    return this.db
      .prepare(
        `SELECT * FROM terms WHERE ${clauses.join(' AND ')} ORDER BY COALESCE(source_text, source_simplified)`,
      )
      .all(...params) as TermRow[];
  }

  /** All project-linked terms — no arbitrary limit (semantic budget ranks downstream). */
  listAllForProject(projectId: string): TermRow[] {
    return this.db
      .prepare(
        `SELECT DISTINCT t.* FROM terms t
         WHERE t.deleted_at IS NULL
           AND (
             (t.scope = 'PROJECT' AND t.scope_ref = ?)
             OR t.id IN (SELECT term_id FROM project_terms WHERE project_id = ?)
           )
         ORDER BY t.id ASC`,
      )
      .all(projectId, projectId) as TermRow[];
  }

  countByProject(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT t.id) AS count FROM terms t
         WHERE t.deleted_at IS NULL
           AND (
             (t.scope = 'PROJECT' AND t.scope_ref = ?)
             OR t.id IN (SELECT term_id FROM project_terms WHERE project_id = ?)
           )`,
      )
      .get(projectId, projectId) as { count: number };
    return row.count;
  }

  search(filters: TermSearchFilters): TermRow[] {
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    const sourceQuery = filters.sourceText?.trim() ?? filters.chinese?.trim();
    if (sourceQuery) {
      where.push(
        `(source_text LIKE ? OR source_simplified LIKE ? OR source_traditional LIKE ? OR source_text = ? OR source_simplified = ?)`,
      );
      const q = `%${sourceQuery}%`;
      params.push(q, q, q, sourceQuery, sourceQuery);
    }
    if (filters.pinyin?.trim()) {
      where.push(`(pinyin LIKE ? OR transliteration LIKE ?)`);
      params.push(`%${filters.pinyin.trim()}%`, `%${filters.pinyin.trim()}%`);
    }
    if (filters.sourceLanguage) {
      where.push(`source_language = ?`);
      params.push(filters.sourceLanguage);
    }
    if (filters.targetLanguage) {
      where.push(`target_language = ?`);
      params.push(filters.targetLanguage);
    }
    if (filters.termType) {
      where.push(`term_type = ?`);
      params.push(filters.termType);
    }
    if (filters.scope) {
      where.push(`scope = ?`);
      params.push(filters.scope);
    }
    if (filters.scopeRef) {
      where.push(`scope_ref = ?`);
      params.push(filters.scopeRef);
    }
    if (filters.status) {
      where.push(`status = ?`);
      params.push(filters.status);
    }
    if (filters.genre?.trim()) {
      where.push(`genre = ?`);
      params.push(filters.genre.trim());
    }
    if (filters.projectId) {
      where.push(
        `id IN (SELECT term_id FROM project_terms WHERE project_id = ?) OR (scope = 'PROJECT' AND scope_ref = ?)`,
      );
      params.push(filters.projectId, filters.projectId);
    }

    let sql = `SELECT DISTINCT t.* FROM terms t`;
    const targetQuery = filters.targetText?.trim() ?? filters.vietnamese?.trim();
    if (targetQuery) {
      sql += ` JOIN term_translations tt ON tt.term_id = t.id`;
      where.push(`tt.target_text LIKE ?`);
      params.push(`%${targetQuery}%`);
    }
    sql += ` WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params) as TermRow[];
  }

  listReviewQueue(limit = 100): TermRow[] {
    return this.db
      .prepare(
        `SELECT * FROM terms WHERE deleted_at IS NULL AND status IN ('DISCOVERED', 'CANDIDATE') ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(limit) as TermRow[];
  }

  update(id: string, input: UpdateTermInput): TermRow | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const termType =
      input.term_type !== undefined
        ? normalizeTermType(input.term_type)
        : existing.term_type;

    const nextSource =
      input.source_text ??
      input.source_simplified ??
      existing.source_text ??
      existing.source_simplified;
    const sourceLanguage = normalizeLanguageCode(
      input.source_language ?? existing.source_language,
    );
    const targetLanguage = normalizeLanguageCode(
      input.target_language ?? existing.target_language,
    );
    const legacy = syncChineseLegacy({
      source_traditional:
        input.source_traditional !== undefined
          ? input.source_traditional
          : existing.source_traditional,
      pinyin: input.pinyin !== undefined ? input.pinyin : existing.pinyin,
      transliteration:
        input.transliteration !== undefined
          ? input.transliteration
          : existing.transliteration,
      transliteration_system:
        input.transliteration_system !== undefined
          ? input.transliteration_system
          : existing.transliteration_system,
      source_variants: input.source_variants,
      source_language: sourceLanguage,
    });

    const nextTraditional =
      legacy.traditional !== undefined
        ? legacy.traditional
        : existing.source_traditional;
    const nextPinyin =
      legacy.pinyin !== undefined ? legacy.pinyin : existing.pinyin;
    const nextTransliteration =
      legacy.transliteration !== undefined
        ? legacy.transliteration
        : existing.transliteration;
    const nextTransliterationSystem =
      legacy.transliterationSystem !== undefined
        ? legacy.transliterationSystem
        : existing.transliteration_system;
    const nextSourceVariants =
      legacy.sourceVariantsJson !== undefined
        ? legacy.sourceVariantsJson
        : existing.source_variants;
    const nextTargetVariants =
      input.target_variants !== undefined
        ? stringifyJsonStringArray(input.target_variants ?? [])
        : existing.target_variants;

    this.db
      .prepare(
        `UPDATE terms SET
          source_text = ?,
          source_simplified = ?,
          source_traditional = ?,
          pinyin = ?,
          source_language = ?,
          target_language = ?,
          source_variants = ?,
          target_variants = ?,
          transliteration = ?,
          transliteration_system = ?,
          term_type = ?,
          genre = ?,
          scope = ?,
          scope_ref = ?,
          status = ?,
          confidence = ?,
          locked = ?,
          meaning = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        nextSource,
        nextSource,
        nextTraditional,
        nextPinyin,
        sourceLanguage,
        targetLanguage,
        nextSourceVariants,
        nextTargetVariants,
        nextTransliteration,
        nextTransliterationSystem,
        termType,
        input.genre !== undefined ? input.genre : existing.genre,
        input.scope ?? existing.scope,
        input.scope_ref !== undefined ? input.scope_ref : existing.scope_ref,
        input.status ?? existing.status,
        input.confidence !== undefined ? input.confidence : existing.confidence,
        input.locked !== undefined ? (input.locked ? 1 : 0) : existing.locked,
        input.meaning !== undefined ? input.meaning : existing.meaning,
        input.notes !== undefined ? input.notes : existing.notes,
        utcNow(),
        id,
      );

    if (input.preferred_translation !== undefined) {
      this.setTranslations(
        id,
        input.preferred_translation,
        input.alternative_translations ?? [],
        targetLanguage,
      );
    } else if (input.alternative_translations !== undefined) {
      const primary = this.getPrimaryTranslation(id) ?? '';
      this.setTranslations(id, primary, input.alternative_translations, targetLanguage);
    }

    return this.getById(id);
  }

  updateStatus(id: string, status: TermStatus): TermRow | null {
    const result = this.db
      .prepare(`UPDATE terms SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(status, utcNow(), id);
    if (result.changes === 0) return null;
    return this.getById(id);
  }

  lock(id: string, locked = true): TermRow | null {
    const status: TermStatus = locked ? 'LOCKED' : 'PROJECT_VERIFIED';
    this.db
      .prepare(`UPDATE terms SET locked = ?, status = ?, updated_at = ? WHERE id = ?`)
      .run(locked ? 1 : 0, status, utcNow(), id);
    return this.getById(id);
  }

  /**
   * Human-only promotion. GLOBAL_VERIFIED must never be set by AI delta processors.
   */
  promote(id: string, targetScope: TermScope, scopeRef?: string | null): TermRow | null {
    const statusMap: Partial<Record<TermScope, TermStatus>> = {
      PROJECT: 'PROJECT_VERIFIED',
      GENRE: 'GENRE_VERIFIED',
      GLOBAL: 'GLOBAL_VERIFIED',
    };
    this.db
      .prepare(
        `UPDATE terms SET scope = ?, scope_ref = ?, status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        targetScope,
        scopeRef ?? null,
        statusMap[targetScope] ?? 'CANDIDATE',
        utcNow(),
        id,
      );
    return this.getById(id);
  }

  mergeTerms(sourceId: string, targetId: string): TermRow | null {
    const target = this.getById(targetId);
    if (!target) return null;

    this.db
      .prepare(`UPDATE term_occurrences SET term_id = ? WHERE term_id = ?`)
      .run(targetId, sourceId);
    this.db
      .prepare(`UPDATE project_terms SET term_id = ? WHERE term_id = ?`)
      .run(targetId, sourceId);
    this.db
      .prepare(
        `UPDATE terms SET occurrence_count = occurrence_count + (SELECT occurrence_count FROM terms WHERE id = ?) WHERE id = ?`,
      )
      .run(sourceId, targetId);
    this.softDelete(sourceId);
    return this.getById(targetId);
  }

  incrementOccurrence(
    id: string,
    projectId: string,
    options?: { chapterId?: string; paragraphId?: string; contextSnippet?: string },
  ): void {
    const ts = touchTimestamps();
    this.db
      .prepare(
        `UPDATE terms SET occurrence_count = occurrence_count + 1, updated_at = ? WHERE id = ?`,
      )
      .run(ts.updated_at, id);

    this.db
      .prepare(
        `INSERT INTO term_occurrences (id, term_id, project_id, chapter_id, paragraph_id, context_snippet, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        id,
        projectId,
        options?.chapterId ?? null,
        options?.paragraphId ?? null,
        options?.contextSnippet ?? null,
        ts.created_at,
      );

    this.refreshProjectCount(id);
  }

  refreshProjectCount(termId: string): void {
    const count = this.db
      .prepare(
        `SELECT COUNT(DISTINCT project_id) AS c FROM term_occurrences WHERE term_id = ?`,
      )
      .get(termId) as { c: number };
    this.db
      .prepare(`UPDATE terms SET project_count = ?, updated_at = ? WHERE id = ?`)
      .run(count.c, utcNow(), termId);
  }

  linkToProject(projectId: string, termId: string, status?: TermStatus): void {
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO project_terms (id, project_id, term_id, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT(project_id, term_id) DO UPDATE SET
           status = COALESCE(excluded.status, project_terms.status),
           updated_at = excluded.updated_at`,
      )
      .run(newId(), projectId, termId, status ?? null, ts.created_at, ts.updated_at);
    this.refreshProjectCount(termId);
  }

  softDelete(id: string): boolean {
    const result = this.db
      .prepare(`UPDATE terms SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(utcNow(), utcNow(), id);
    return result.changes > 0;
  }

  searchFts(query: string, limit = 20): TermSearchResult[] {
    return this.db
      .prepare(
        `SELECT term_id, rank FROM terms_fts WHERE terms_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(query, limit) as TermSearchResult[];
  }

  getPrimaryTranslation(termId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT target_text FROM term_translations WHERE term_id = ? AND is_primary = 1 LIMIT 1`,
      )
      .get(termId) as { target_text: string } | undefined;
    return row?.target_text ?? null;
  }

  listTranslations(termId: string): TermTranslationRow[] {
    return this.db
      .prepare(
        `SELECT * FROM term_translations WHERE term_id = ? ORDER BY is_primary DESC, created_at ASC`,
      )
      .all(termId) as TermTranslationRow[];
  }

  setTranslations(
    termId: string,
    primary: string,
    alternatives: string[],
    targetLanguage?: string,
  ): void {
    const ts = touchTimestamps();
    const term = this.getById(termId);
    const lang =
      targetLanguage ??
      term?.target_language ??
      DEFAULT_TARGET_LANGUAGE;
    this.db.prepare(`DELETE FROM term_translations WHERE term_id = ?`).run(termId);
    if (primary.trim()) {
      this.db
        .prepare(
          `INSERT INTO term_translations (id, term_id, target_text, target_language, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(newId(), termId, primary.trim(), lang, ts.created_at, ts.updated_at);
    }
    for (const alt of alternatives) {
      if (!alt.trim() || alt.trim() === primary.trim()) continue;
      this.db
        .prepare(
          `INSERT INTO term_translations (id, term_id, target_text, target_language, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(newId(), termId, alt.trim(), lang, ts.created_at, ts.updated_at);
    }
  }

  listAllActive(): TermRow[] {
    return this.db
      .prepare(`SELECT * FROM terms WHERE deleted_at IS NULL AND status != 'REJECTED'`)
      .all() as TermRow[];
  }
}
