/** Project Data Workbook sheet names. */
export const PROJECT_DATA_WORKBOOK_SHEETS = [
  'PROJECT',
  'RULES',
  'WORLD_KNOWLEDGE',
  'STORY_FACTS',
] as const;

export type ProjectDataWorkbookSheet = (typeof PROJECT_DATA_WORKBOOK_SHEETS)[number];

export const PROJECT_DATA_COMMIT_ORDER: ProjectDataWorkbookSheet[] = [
  'PROJECT',
  'RULES',
  'WORLD_KNOWLEDGE',
  'STORY_FACTS',
];

export const PROJECT_DATA_TABULAR_COLUMNS = [
  'project_id',
  'source_title',
  'edition_title',
  'source_language',
  'target_language',
  'author',
  'genre',
  'status',
  'description',
  'official_summary',
] as const;

export const RULES_TABULAR_COLUMNS = [
  'rule_id',
  'priority',
  'category',
  'rule_text',
  'enabled',
  'locked',
] as const;

export const WORLD_KNOWLEDGE_TABULAR_COLUMNS = [
  'fact_id',
  'category',
  'source_key',
  'target_label',
  'description',
  'first_seen_chapter',
  'valid_from_chapter',
  'confidence',
  'locked',
] as const;

export const STORY_FACTS_TABULAR_COLUMNS = [
  'memory_id',
  'category',
  'key',
  'value',
  'chapter',
  'valid_from',
  'valid_to',
] as const;

export const PROJECT_DATA_WARNINGS = {
  PROJECT_ID_MISMATCH: 'PROJECT_ID_MISMATCH',
  UNSAFE_PROJECT_FIELD: 'UNSAFE_PROJECT_FIELD',
  STORY_FACTS_ADVANCED: 'STORY_FACTS_ADVANCED',
  WORLD_FACT_LOCKED: 'WORLD_FACT_LOCKED',
  RULE_LOCKED: 'RULE_LOCKED',
  MEMORY_LOCKED: 'MEMORY_LOCKED',
} as const;

/** Safe PROJECT fields importable from workbook. */
export const PROJECT_SAFE_IMPORT_FIELDS = new Set([
  'source_title',
  'edition_title',
  'author',
  'genre',
  'description',
  'official_summary',
]);
