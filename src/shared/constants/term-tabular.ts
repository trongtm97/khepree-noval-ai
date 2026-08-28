/** Term Vault tabular export scope filters. */
export const TERM_TABULAR_EXPORT_SCOPES = [
  'current_project',
  'current_edition',
  'all_terms',
  'locked_only',
  'verified_only',
  'candidates_only',
] as const;
export type TermTabularExportScope = (typeof TERM_TABULAR_EXPORT_SCOPES)[number];

/** Duplicate resolution when importing terms. */
export const TERM_TABULAR_DUPLICATE_STRATEGIES = [
  'SKIP',
  'MERGE',
  'REPLACE_TARGET',
  'CREATE_CANDIDATE',
] as const;
export type TermTabularDuplicateStrategy = (typeof TERM_TABULAR_DUPLICATE_STRATEGIES)[number];

/** Default status for imported terms without explicit status. */
export const TERM_TABULAR_DEFAULT_STATUSES = ['PROJECT_VERIFIED', 'CANDIDATE'] as const;
export type TermTabularDefaultStatus = (typeof TERM_TABULAR_DEFAULT_STATUSES)[number];

/** Statuses considered verified for export filter. */
export const TERM_TABULAR_VERIFIED_STATUSES = [
  'PROJECT_VERIFIED',
  'GENRE_VERIFIED',
  'GLOBAL_VERIFIED',
] as const;

/** Statuses considered candidates for export filter. */
export const TERM_TABULAR_CANDIDATE_STATUSES = ['CANDIDATE', 'DISCOVERED'] as const;

/** Statuses that external import cannot set without explicit permission. */
export const TERM_TABULAR_ELEVATED_STATUSES = ['GLOBAL_VERIFIED', 'LOCKED'] as const;

/** Canonical Term Vault XLSX/CSV column order. */
export const TERM_TABULAR_COLUMNS = [
  'term_id',
  'source_language',
  'target_language',
  'source_text',
  'target_text',
  'source_variants',
  'target_variants',
  'transliteration',
  'transliteration_system',
  'term_type',
  'scope',
  'scope_ref',
  'status',
  'locked',
  'confidence',
  'occurrence_count',
  'notes',
  'simplified',
  'traditional',
  'pinyin',
] as const;

export type TermTabularColumn = (typeof TERM_TABULAR_COLUMNS)[number];
