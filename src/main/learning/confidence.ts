import {
  CONFIDENCE_DELTA,
  TERM_DELTA_CONFIDENCE_MAP,
} from '@shared/constants/learning';
import type { TermRow } from '../db/repositories/term-repository';

export function mapDeltaConfidence(
  level: 'low' | 'medium' | 'high' | undefined,
): number {
  if (!level) return TERM_DELTA_CONFIDENCE_MAP.medium;
  return TERM_DELTA_CONFIDENCE_MAP[level];
}

/**
 * Recompute confidence from evidence.
 * Never implies GLOBAL_VERIFIED — status changes are separate and human-gated for GLOBAL.
 */
export function computeAdjustedConfidence(term: {
  confidence: number | null;
  occurrence_count: number;
  project_count: number;
  human_confirm_count?: number;
  status: string;
}): number {
  const base = term.confidence ?? CONFIDENCE_DELTA.aiFloor;
  const occurrenceBoost = Math.min(
    term.occurrence_count * CONFIDENCE_DELTA.occurrence,
    CONFIDENCE_DELTA.occurrenceCap,
  );
  const projectBoost = Math.min(
    term.project_count * CONFIDENCE_DELTA.projectConfirm,
    CONFIDENCE_DELTA.projectConfirmCap,
  );
  const humanBoost =
    (term.human_confirm_count ?? 0) * CONFIDENCE_DELTA.humanConfirm;

  let next = base + occurrenceBoost + projectBoost + humanBoost;

  const verified =
    term.status === 'PROJECT_VERIFIED' ||
    term.status === 'GENRE_VERIFIED' ||
    term.status === 'LOCKED' ||
    term.status === 'GLOBAL_VERIFIED';

  const ceiling = verified
    ? CONFIDENCE_DELTA.projectVerifiedCeiling
    : CONFIDENCE_DELTA.aiCeiling;

  next = Math.max(CONFIDENCE_DELTA.aiFloor, Math.min(ceiling, next));
  return Number(next.toFixed(4));
}

export function refreshTermConfidence(term: TermRow): number {
  return computeAdjustedConfidence({
    confidence: term.confidence,
    occurrence_count: term.occurrence_count,
    project_count: term.project_count,
    human_confirm_count: term.human_confirm_count,
    status: term.status,
  });
}
