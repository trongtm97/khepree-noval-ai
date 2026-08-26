import type { CandidateStatus } from '@shared/constants/term';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface TermCandidateRow {
  id: string;
  project_id: string | null;
  chapter_id: string | null;
  source_text: string;
  suggested_type: string | null;
  suggested_translation: string | null;
  confidence: number | null;
  frequency: number;
  heuristic_tags: string | null;
  context_snippet: string | null;
  status: string;
  notes: string | null;
  first_seen_chapter: number | null;
  discovered_from_chapter: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCandidateInput {
  project_id?: string | null;
  chapter_id?: string | null;
  source_text: string;
  suggested_type?: string | null;
  suggested_translation?: string | null;
  confidence?: number | null;
  frequency?: number;
  heuristic_tags?: string[];
  context_snippet?: string | null;
  status?: CandidateStatus;
  notes?: string | null;
  first_seen_chapter?: number | null;
  discovered_from_chapter?: number | null;
}

export class TermCandidateRepository extends BaseRepository {
  upsertCandidate(input: CreateCandidateInput): TermCandidateRow {
    const existing = this.db
      .prepare(
        `SELECT * FROM term_candidates WHERE source_text = ? AND project_id IS ? AND status = 'PENDING' LIMIT 1`,
      )
      .get(input.source_text, input.project_id ?? null) as TermCandidateRow | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE term_candidates SET frequency = frequency + ?, confidence = MAX(COALESCE(confidence,0), COALESCE(?,0)), updated_at = ? WHERE id = ?`,
        )
        .run(input.frequency ?? 1, input.confidence ?? null, utcNow(), existing.id);
      return this.assertRow(this.getById(existing.id), 'candidate', existing.id);
    }

    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO term_candidates (
          id, project_id, chapter_id, source_text, suggested_type, suggested_translation,
          confidence, frequency, heuristic_tags, context_snippet, status, notes,
          first_seen_chapter, discovered_from_chapter,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.chapter_id ?? null,
        input.source_text,
        input.suggested_type ?? null,
        input.suggested_translation ?? null,
        input.confidence ?? null,
        input.frequency ?? 1,
        input.heuristic_tags ? JSON.stringify(input.heuristic_tags) : null,
        input.context_snippet ?? null,
        input.status ?? 'PENDING',
        input.notes ?? null,
        input.first_seen_chapter ?? null,
        input.discovered_from_chapter ?? null,
        ts.created_at,
        ts.updated_at,
      );
    return this.assertRow(this.getById(id), 'candidate', id);
  }

  getById(id: string): TermCandidateRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM term_candidates WHERE id = ?`)
        .get(id) as TermCandidateRow | undefined) ?? null
    );
  }

  listPending(projectId?: string, limit = 200): TermCandidateRow[] {
    if (projectId) {
      return this.db
        .prepare(
          `SELECT * FROM term_candidates WHERE status = 'PENDING' AND project_id = ? ORDER BY frequency DESC, updated_at DESC LIMIT ?`,
        )
        .all(projectId, limit) as TermCandidateRow[];
    }
    return this.db
      .prepare(
        `SELECT * FROM term_candidates WHERE status = 'PENDING' ORDER BY frequency DESC, updated_at DESC LIMIT ?`,
      )
      .all(limit) as TermCandidateRow[];
  }

  /** High-confidence pending candidates with a suggested translation for pack matching. */
  listPendingForPack(
    projectId: string,
    minConfidence: number,
    limit = 80,
  ): TermCandidateRow[] {
    return this.db
      .prepare(
        `SELECT * FROM term_candidates
         WHERE status = 'PENDING'
           AND project_id = ?
           AND suggested_translation IS NOT NULL
           AND TRIM(suggested_translation) != ''
           AND COALESCE(confidence, 0) >= ?
         ORDER BY confidence DESC, frequency DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(projectId, minConfidence, limit) as TermCandidateRow[];
  }

  updateStatus(id: string, status: CandidateStatus): TermCandidateRow | null {
    this.db
      .prepare(`UPDATE term_candidates SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, utcNow(), id);
    return this.getById(id);
  }
}
