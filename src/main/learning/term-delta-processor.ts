import {
  normalizeTermType,
  type TermStatus,
} from '@shared/constants/term';
import {
  parseTermDelta,
  type TermDeltaItem,
} from '@shared/schemas/term-delta';
import type { DatabaseManager } from '../db/database-manager';
import { withTransaction } from '../db/transaction';
import { mapDeltaConfidence, refreshTermConfidence } from './confidence';
import { utcNow } from '../db/utils/timestamps';

export interface TermDeltaContext {
  projectId: string;
  chapterId?: string | null;
  chapterNumber?: number | null;
  /** Source snippet for occurrence records. */
  sourceContext?: string | null;
  jobId?: string | null;
}

export interface TermDeltaApplyResult {
  candidatesCreated: number;
  candidatesMerged: number;
  occurrencesRecorded: number;
  confirms: number;
  updates: number;
  skipped: number;
  /** Locked / LOCKED vault terms touched (update proposal or confirm bump). */
  lockedTouched: number;
}

/**
 * Process TERM_DELTA after QA PASS.
 * - New terms → candidates only (never GLOBAL_VERIFIED)
 * - Duplicates merge (candidate frequency / vault occurrence)
 * - confirm → PROJECT_VERIFIED + human_confirm (never GLOBAL)
 */
export function applyTermDelta(
  db: DatabaseManager,
  raw: unknown,
  ctx: TermDeltaContext,
): TermDeltaApplyResult {
  const items = normalizeItems(raw);
  const result: TermDeltaApplyResult = {
    candidatesCreated: 0,
    candidatesMerged: 0,
    occurrencesRecorded: 0,
    confirms: 0,
    updates: 0,
    skipped: 0,
    lockedTouched: 0,
  };

  withTransaction(db.getConnection(), () => {
    for (const item of items) {
      applyItem(db, item, ctx, result);
    }
  });

  return result;
}

function normalizeItems(raw: unknown): TermDeltaItem[] {
  if (Array.isArray(raw) && raw.length === 0) return [];
  try {
    return parseTermDelta(raw);
  } catch {
    if (Array.isArray(raw)) {
      const out: TermDeltaItem[] = [];
      for (const item of raw) {
        try {
          out.push(...parseTermDelta([item]));
        } catch {
          /* skip invalid item */
        }
      }
      return out;
    }
    return [];
  }
}

function applyItem(
  db: DatabaseManager,
  item: TermDeltaItem,
  ctx: TermDeltaContext,
  result: TermDeltaApplyResult,
): void {
  switch (item.action) {
    case 'discover':
      applyDiscover(db, item, ctx, result);
      break;
    case 'update':
      applyUpdate(db, item, ctx, result);
      break;
    case 'confirm':
      applyConfirm(db, item, ctx, result);
      break;
    default:
      result.skipped += 1;
  }
}

function applyDiscover(
  db: DatabaseManager,
  item: Extract<TermDeltaItem, { action: 'discover' }>,
  ctx: TermDeltaContext,
  result: TermDeltaApplyResult,
): void {
  const existing = db.terms.findBySource(item.source, ctx.projectId);
  const confidence = mapDeltaConfidence(item.confidence);

  if (existing) {
    // Duplicate vault term → merge via occurrence + confidence bump
    recordOccurrence(db, existing.id, ctx);
    result.occurrencesRecorded += 1;
    const refreshed = db.terms.getById(existing.id);
    if (refreshed) {
      const next = Math.max(refreshTermConfidence(refreshed), confidence);
      db.terms.setConfidence(existing.id, Math.min(next, 0.85));
    }
    db.learningEvents.create({
      project_id: ctx.projectId,
      event_type: 'term_merge',
      job_id: ctx.jobId,
      payload: { source: item.source, termId: existing.id, via: 'discover_duplicate' },
    });
    result.candidatesMerged += 1;
    return;
  }

  const before = db.termCandidates
    .listPending(ctx.projectId)
    .find((c) => c.source_text === item.source);
  const candidate = db.termCandidates.upsertCandidate({
    project_id: ctx.projectId,
    chapter_id: ctx.chapterId ?? null,
    source_text: item.source,
    suggested_type: normalizeTermType(item.category),
    suggested_translation: item.target,
    confidence,
    frequency: 1,
    heuristic_tags: ['term_delta', 'ai'],
    context_snippet: ctx.sourceContext?.slice(0, 500) ?? item.notes ?? null,
    notes: item.notes ?? null,
  });

  if (before) {
    result.candidatesMerged += 1;
  } else {
    result.candidatesCreated += 1;
  }

  db.learningEvents.create({
    project_id: ctx.projectId,
    event_type: 'term_candidate',
    job_id: ctx.jobId,
    payload: {
      candidateId: candidate.id,
      source: item.source,
      target: item.target,
      merged: Boolean(before),
    },
  });
}

function applyUpdate(
  db: DatabaseManager,
  item: Extract<TermDeltaItem, { action: 'update' }>,
  ctx: TermDeltaContext,
  result: TermDeltaApplyResult,
): void {
  const existing = db.terms.findBySource(item.source, ctx.projectId);
  if (existing) {
    if (existing.locked === 1 || existing.status === 'GLOBAL_VERIFIED' || existing.status === 'LOCKED') {
      // Never auto-mutate locked / global — leave as candidate suggestion only
      db.termCandidates.upsertCandidate({
        project_id: ctx.projectId,
        chapter_id: ctx.chapterId ?? null,
        source_text: item.source,
        suggested_translation: item.target,
        suggested_type: item.category ? normalizeTermType(item.category) : null,
        confidence: 0.4,
        frequency: 1,
        heuristic_tags: ['term_delta_update', 'locked_or_global'],
        context_snippet: ctx.sourceContext?.slice(0, 500) ?? null,
        notes: `Update proposed for ${existing.status} term`,
      });
      result.skipped += 1;
      if (existing.locked === 1 || existing.status === 'LOCKED') {
        result.lockedTouched += 1;
      }
      return;
    }
    recordOccurrence(db, existing.id, ctx);
    result.occurrencesRecorded += 1;
    // Soft update notes only — translation changes stay human-reviewed unless CANDIDATE/DISCOVERED
    if (existing.status === 'CANDIDATE' || existing.status === 'DISCOVERED') {
      const translations = db.terms.listTranslations(existing.id);
      const primary = translations.find((t) => t.is_primary === 1);
      if (primary && primary.target_text !== item.target) {
        db.getConnection()
          .prepare(
            `UPDATE term_translations SET target_text = ?, updated_at = ? WHERE id = ?`,
          )
          .run(item.target, utcNow(), primary.id);
      }
    }
    const refreshed = db.terms.getById(existing.id);
    if (refreshed) {
      db.terms.setConfidence(existing.id, refreshTermConfidence(refreshed));
    }
    result.updates += 1;
    return;
  }

  // No vault term → candidate
  db.termCandidates.upsertCandidate({
    project_id: ctx.projectId,
    chapter_id: ctx.chapterId ?? null,
    source_text: item.source,
    suggested_translation: item.target,
    suggested_type: item.category ? normalizeTermType(item.category) : null,
    confidence: 0.4,
    frequency: 1,
    heuristic_tags: ['term_delta_update'],
    context_snippet: ctx.sourceContext?.slice(0, 500) ?? null,
  });
  result.candidatesCreated += 1;
}

/**
 * AI/project confirm → PROJECT_VERIFIED at most.
 * Explicit policy: never GLOBAL_VERIFIED from delta.
 */
function applyConfirm(
  db: DatabaseManager,
  item: Extract<TermDeltaItem, { action: 'confirm' }>,
  ctx: TermDeltaContext,
  result: TermDeltaApplyResult,
): void {
  let term = db.terms.findBySource(item.source, ctx.projectId);

  if (!term) {
    // Promote candidate into project CANDIDATE/PROJECT vault entry — still not GLOBAL
    const pending = db.termCandidates
      .listPending(ctx.projectId)
      .find((c) => c.source_text === item.source);
    term = db.terms.create({
      source_simplified: item.source,
      term_type: pending?.suggested_type
        ? normalizeTermType(pending.suggested_type)
        : 'OTHER',
      scope: 'PROJECT',
      scope_ref: ctx.projectId,
      status: 'PROJECT_VERIFIED',
      confidence: 0.7,
      preferred_translation:
        (item.target !== '' ? item.target : null) ??
        pending?.suggested_translation ??
        item.source,
      notes: 'Confirmed via TERM_DELTA (project only)',
    });
    db.terms.linkToProject(ctx.projectId, term.id, 'PROJECT_VERIFIED');
    if (pending) {
      db.termCandidates.updateStatus(pending.id, 'ACCEPTED');
    }
  } else if (
    term.status !== 'LOCKED' &&
    term.status !== 'GLOBAL_VERIFIED' &&
    term.status !== 'GENRE_VERIFIED'
  ) {
    // Project confirmation only — never escalate to GLOBAL
    const status: TermStatus = 'PROJECT_VERIFIED';
    db.terms.update(term.id, {
      status,
      scope: 'PROJECT',
      scope_ref: ctx.projectId,
    });
    db.terms.linkToProject(ctx.projectId, term.id, status);
  }

  const id = term.id;
  db.terms.bumpHumanConfirm(id);
  recordOccurrence(db, id, ctx);
  result.occurrencesRecorded += 1;
  result.confirms += 1;
  if (term.locked === 1 || term.status === 'LOCKED') {
    result.lockedTouched += 1;
  }

  const refreshed = db.terms.getById(id);
  if (refreshed) {
    db.terms.setConfidence(id, refreshTermConfidence(refreshed));
  }

  db.learningEvents.create({
    project_id: ctx.projectId,
    event_type: 'term_confirm',
    job_id: ctx.jobId,
    payload: { termId: id, source: item.source, status: 'PROJECT_VERIFIED' },
  });
}

function recordOccurrence(
  db: DatabaseManager,
  termId: string,
  ctx: TermDeltaContext,
): void {
  db.terms.incrementOccurrence(termId, ctx.projectId, {
    chapterId: ctx.chapterId ?? undefined,
    contextSnippet: ctx.sourceContext?.slice(0, 500) ?? undefined,
  });
  db.learningEvents.create({
    project_id: ctx.projectId,
    event_type: 'term_occurrence',
    job_id: ctx.jobId,
    payload: {
      termId,
      chapterId: ctx.chapterId,
      chapterNumber: ctx.chapterNumber,
    },
  });
}
