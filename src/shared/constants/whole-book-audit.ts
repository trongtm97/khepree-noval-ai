/**
 * Whole-book Audit constants (Prompt 10).
 */

export const WHOLE_BOOK_AUDIT_RUN_STATUSES = [
  'PENDING',
  'INDEXING',
  'SCANNING',
  'REPAIRING',
  'EXPORTING',
  'COMPLETED',
  'NEEDS_ATTENTION',
  'FAILED',
  'CANCELLED',
] as const;

export type WholeBookAuditRunStatus =
  (typeof WHOLE_BOOK_AUDIT_RUN_STATUSES)[number];

/** Audit-specific finding codes (also stored in translation_qa_findings.code). */
export const WHOLE_BOOK_AUDIT_CODES = [
  'chapter_missing_translation',
  'chapter_truncated',
  'chapter_duplicate_content',
  'character_name_mismatch',
  'character_alias_ok', // informational — valid alias, not an error when detected
  'pronoun_gender_inconsistency',
  'address_form_mismatch',
  'place_org_inconsistency',
  'skill_rank_inconsistency',
  'glossary_human_locked_conflict',
  'timeline_state_conflict',
  'style_term_drift',
] as const;

export type WholeBookAuditCode = (typeof WHOLE_BOOK_AUDIT_CODES)[number];

/** Safe auto-repair codes (string replace of known glossary preferred forms only). */
export const WHOLE_BOOK_SAFE_AUTO_REPAIR_CODES = new Set([
  'locked_term_forbidden_variant',
  'style_term_drift',
]);

export const WHOLE_BOOK_CRITICAL_CODES = new Set([
  'chapter_missing_translation',
  'chapter_truncated',
  'missing_paragraph',
  'empty_translation',
  'corrupt_translation',
  'glossary_human_locked_conflict',
  'character_name_mismatch',
  'timeline_state_conflict',
]);
