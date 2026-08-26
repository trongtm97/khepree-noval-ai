import type { TermScope, TermStatus, TermType } from '@shared/constants/term';
import { normalizeTermType } from '@shared/constants/term';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface TermRow {
  id: string;
  source_simplified: string;
  source_traditional: string | null;
  pinyin: string | null;
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TermTranslationRow {
  id: string;
  term_id: string;
  target_text: string;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTermInput {
  source_simplified: string;
  source_traditional?: string | null;
  pinyin?: string | null;
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
  source_simplified?: string;
  source_traditional?: string | null;
  pinyin?: string | null;
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
  pinyin?: string;
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

export class TermRepository extends BaseRepository {
  create(input: CreateTermInput): TermRow {
    const id = newId();
    const ts = touchTimestamps();
    const termType = normalizeTermType(input.term_type ?? 'OTHER');

    this.db
      .prepare(
        `INSERT INTO terms (
          id, source_simplified, source_traditional, pinyin, term_type, genre,
          scope, scope_ref, status, confidence, occurrence_count, novel_count,
          project_count, locked, meaning, notes, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        input.source_simplified,
        input.source_traditional ?? null,
        input.pinyin ?? null,
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
  ): TermRow | null {
    const row = scopeRef
      ? (this.db
          .prepare(
            `SELECT * FROM terms WHERE source_simplified = ? AND scope = ? AND scope_ref = ? AND deleted_at IS NULL LIMIT 1`,
          )
          .get(source, scope, scopeRef) as TermRow | undefined)
      : (this.db
          .prepare(
            `SELECT * FROM terms WHERE source_simplified = ? AND scope = ? AND scope_ref IS NULL AND deleted_at IS NULL LIMIT 1`,
          )
          .get(source, scope) as TermRow | undefined);
    return row ?? null;
  }

  /** Any non-deleted term matching source (prefer PROJECT-linked). */
  findBySource(sourceSimplified: string, projectId?: string): TermRow | null {
    if (projectId) {
      const projectScoped = this.db
        .prepare(
          `SELECT * FROM terms
           WHERE source_simplified = ? AND deleted_at IS NULL
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
        .get(sourceSimplified, projectId, projectId) as TermRow | undefined;
      if (projectScoped) return projectScoped;
    }
    return (
      (this.db
        .prepare(
          `SELECT * FROM terms WHERE source_simplified = ? AND deleted_at IS NULL
           ORDER BY occurrence_count DESC LIMIT 1`,
        )
        .get(sourceSimplified) as TermRow | undefined) ?? null
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

  /** All active terms for matcher (optionally filtered by project/genre context). */
  listForMatching(context: {
    projectId?: string;
    genre?: string | null;
    userId?: string;
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

    return this.db
      .prepare(
        `SELECT * FROM terms WHERE ${clauses.join(' AND ')} ORDER BY source_simplified`,
      )
      .all(...params) as TermRow[];
  }

  search(filters: TermSearchFilters): TermRow[] {
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filters.chinese?.trim()) {
      where.push(
        `(source_simplified LIKE ? OR source_traditional LIKE ? OR source_simplified = ?)`,
      );
      const q = `%${filters.chinese.trim()}%`;
      params.push(q, q, filters.chinese.trim());
    }
    if (filters.pinyin?.trim()) {
      where.push(`pinyin LIKE ?`);
      params.push(`%${filters.pinyin.trim()}%`);
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
    if (filters.vietnamese?.trim()) {
      sql += ` JOIN term_translations tt ON tt.term_id = t.id`;
      where.push(`tt.target_text LIKE ?`);
      params.push(`%${filters.vietnamese.trim()}%`);
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

    this.db
      .prepare(
        `UPDATE terms SET
          source_simplified = ?,
          source_traditional = ?,
          pinyin = ?,
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
        input.source_simplified ?? existing.source_simplified,
        input.source_traditional !== undefined
          ? input.source_traditional
          : existing.source_traditional,
        input.pinyin !== undefined ? input.pinyin : existing.pinyin,
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
      );
    } else if (input.alternative_translations !== undefined) {
      const primary = this.getPrimaryTranslation(id) ?? '';
      this.setTranslations(id, primary, input.alternative_translations);
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

  setTranslations(termId: string, primary: string, alternatives: string[]): void {
    const ts = touchTimestamps();
    this.db.prepare(`DELETE FROM term_translations WHERE term_id = ?`).run(termId);
    if (primary.trim()) {
      this.db
        .prepare(
          `INSERT INTO term_translations (id, term_id, target_text, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(newId(), termId, primary.trim(), ts.created_at, ts.updated_at);
    }
    for (const alt of alternatives) {
      if (!alt.trim() || alt.trim() === primary.trim()) continue;
      this.db
        .prepare(
          `INSERT INTO term_translations (id, term_id, target_text, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)`,
        )
        .run(newId(), termId, alt.trim(), ts.created_at, ts.updated_at);
    }
  }

  listAllActive(): TermRow[] {
    return this.db
      .prepare(`SELECT * FROM terms WHERE deleted_at IS NULL AND status != 'REJECTED'`)
      .all() as TermRow[];
  }
}
