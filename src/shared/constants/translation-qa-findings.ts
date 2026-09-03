/**
 * Translation QA findings (Prompt 09) — structured local checks + Attention Inbox.
 */

import type { QaIssueCode } from './output-protocol';
import type { RepairReason } from './job';
import type { TranslationRecipeRepairScope } from './translation-recipes';

export const TRANSLATION_QA_FINDING_STATUSES = [
  'OPEN',
  'DISMISSED',
  'RESOLVED',
  'ATTENTION',
  'AUTO_REPAIRED',
] as const;

export type TranslationQaFindingStatus =
  (typeof TRANSLATION_QA_FINDING_STATUSES)[number];

export const TRANSLATION_QA_SUGGESTED_ACTIONS = [
  'targeted_repair',
  'attention_inbox',
  'dismiss_ok',
  'manual_edit',
  'recheck_only',
] as const;

export type TranslationQaSuggestedAction =
  (typeof TRANSLATION_QA_SUGGESTED_ACTIONS)[number];

export const TRANSLATION_QA_FINDING_SEVERITIES = [
  'error',
  'warning',
  'info',
] as const;

export type TranslationQaFindingSeverity =
  (typeof TRANSLATION_QA_FINDING_SEVERITIES)[number];

/** Extra local check codes beyond core output-protocol QA_ISSUE_CODES. */
export const EXTENDED_QA_ISSUE_CODES = [
  'length_anomaly',
  'repeated_content',
  'number_unit_mismatch',
  'unverifiable_content',
  'dialogue_punctuation',
  'character_consistency',
  'extra_paragraph',
] as const;

export type ExtendedQaIssueCode = (typeof EXTENDED_QA_ISSUE_CODES)[number];

export type TranslationQaFindingCode = QaIssueCode | ExtendedQaIssueCode;

/**
 * Transparent quality composition — not a vague "quality score".
 * Components + weights are public; score = weighted pass ratio of checked components.
 */
export const QA_SCORE_COMPONENTS = {
  structure: { weight: 0.35, label: 'Structure (missing/order/empty)' },
  glossary: { weight: 0.25, label: 'Glossary / locked terms' },
  language: { weight: 0.2, label: 'Language / leakage / punctuation' },
  fidelity: { weight: 0.2, label: 'Numbers / length / hallucination heuristics' },
} as const;

export type QaScoreComponentKey = keyof typeof QA_SCORE_COMPONENTS;

/** Map finding codes → score component for transparent scoring. */
export function scoreComponentForCode(
  code: string,
): QaScoreComponentKey | null {
  switch (code) {
    case 'missing_paragraph':
    case 'duplicate_paragraph':
    case 'unknown_paragraph':
    case 'empty_translation':
    case 'out_of_order':
    case 'extra_paragraph':
    case 'corrupt_translation':
    case 'parse_uncertain':
      return 'structure';
    case 'locked_term_missing':
    case 'locked_term_forbidden_variant':
    case 'edition_term_leak':
      return 'glossary';
    case 'source_leakage':
    case 'target_language_mismatch':
    case 'punctuation_style':
    case 'dialogue_punctuation':
    case 'address_inconsistency':
    case 'character_consistency':
    case 'character_name_mismatch':
    case 'pronoun_gender_inconsistency':
    case 'address_form_mismatch':
      return 'language';
    case 'length_anomaly':
    case 'repeated_content':
    case 'number_unit_mismatch':
    case 'unverifiable_content':
    case 'chapter_missing_translation':
    case 'chapter_truncated':
    case 'chapter_duplicate_content':
    case 'glossary_human_locked_conflict':
    case 'timeline_state_conflict':
    case 'place_org_inconsistency':
    case 'skill_rank_inconsistency':
    case 'style_term_drift':
      return 'fidelity';
    default:
      return null;
  }
}

/** Repair reasons allowed per recipe repairScope. */
export const REPAIR_SCOPE_ALLOWED_REASONS: Record<
  TranslationRecipeRepairScope,
  ReadonlySet<RepairReason>
> = {
  structure_only: new Set([
    'MISSING_PARAGRAPH',
    'EMPTY_PARAGRAPH',
    'CORRUPT_PARAGRAPH',
    'MALFORMED_OUTPUT',
    'OUTPUT_INCOMPLETE',
    'MEMORY_JSON_INVALID',
  ]),
  targeted: new Set([
    'MISSING_PARAGRAPH',
    'EMPTY_PARAGRAPH',
    'CORRUPT_PARAGRAPH',
    'MALFORMED_OUTPUT',
    'OUTPUT_INCOMPLETE',
    'MEMORY_JSON_INVALID',
    'TERM_VIOLATION',
  ]),
  bounded: new Set([
    'MISSING_PARAGRAPH',
    'EMPTY_PARAGRAPH',
    'CORRUPT_PARAGRAPH',
    'MALFORMED_OUTPUT',
    'OUTPUT_INCOMPLETE',
    'MEMORY_JSON_INVALID',
    'TERM_VIOLATION',
  ]),
};

export function isRepairReasonAllowed(
  scope: TranslationRecipeRepairScope,
  reason: RepairReason,
): boolean {
  return REPAIR_SCOPE_ALLOWED_REASONS[scope]?.has(reason) ?? false;
}
