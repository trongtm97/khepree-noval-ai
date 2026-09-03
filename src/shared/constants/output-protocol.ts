/** Output protocol tags + QA verdicts (Phase 13). */

export const OUTPUT_PROTOCOL_VERSION = 2;

export const OUTPUT_SECTION_TAGS = [
  'TRANSLATION',
  'TERM_DELTA',
  'MEMORY_DELTA',
] as const;

export type OutputSectionTag = (typeof OUTPUT_SECTION_TAGS)[number];

/** Line: [C000001:P000001] text */
export const TRANSLATION_LINE_RE = /^\[(C\d{6}:P\d{6})\]\s*(.*)$/;

/** Bare paragraph token inside brackets for tolerant scan */
export const PARAGRAPH_ID_TOKEN_RE = /\[(C\d{6}:P\d{6})\]/g;

export const PARSE_STATUSES = [
  'ok',
  'recovered',
  'needs_repair',
] as const;

export type ParseStatus = (typeof PARSE_STATUSES)[number];

export const QA_VERDICTS = [
  'PASS',
  'PASS_WITH_WARNINGS',
  'REPAIR_REQUIRED',
  'MANUAL_REVIEW',
] as const;

export type QaVerdict = (typeof QA_VERDICTS)[number];

export const QA_ISSUE_CODES = [
  'missing_paragraph',
  'duplicate_paragraph',
  'unknown_paragraph',
  'empty_translation',
  'corrupt_translation',
  'out_of_order',
  'locked_term_forbidden_variant',
  'locked_term_missing',
  'parse_uncertain',
  'invalid_term_delta',
  'invalid_memory_delta',
  'section_missing',
  'target_language_mismatch',
  'source_leakage',
  'punctuation_style',
  'edition_term_leak',
  'address_inconsistency',
  'style_suggestion',
  // Prompt 09 extended local checks
  'length_anomaly',
  'repeated_content',
  'number_unit_mismatch',
  'unverifiable_content',
  'dialogue_punctuation',
  'character_consistency',
  'extra_paragraph',
  // Prompt 10 whole-book audit
  'chapter_missing_translation',
  'chapter_truncated',
  'chapter_duplicate_content',
  'character_name_mismatch',
  'pronoun_gender_inconsistency',
  'address_form_mismatch',
  'place_org_inconsistency',
  'skill_rank_inconsistency',
  'glossary_human_locked_conflict',
  'timeline_state_conflict',
  'style_term_drift',
] as const;

export type QaIssueCode = (typeof QA_ISSUE_CODES)[number];

export const PARSE_WARNING_CODES = [
  'markdown_fence_stripped',
  'intro_prose_ignored',
  'missing_closing_tag',
  'json_repaired',
  'empty_delta_assumed',
  'strict_failed_tolerant_used',
  'trailing_comma_removed',
  'single_quotes_normalized',
  'delta_discarded',
] as const;

export type ParseWarningCode = (typeof PARSE_WARNING_CODES)[number];
