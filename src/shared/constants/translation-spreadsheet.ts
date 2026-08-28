/** Translation spreadsheet sheet name (XLSX). */
export const TRANSLATION_SPREADSHEET_SHEET = 'TRANSLATIONS' as const;

export const TRANSLATION_SPREADSHEET_OPTIONAL_SHEETS = ['QA_ISSUES', 'TERMS_REFERENCE'] as const;

export const TRANSLATION_SPREADSHEET_COLUMNS = [
  'project_id',
  'edition_id',
  'chapter_number',
  'chapter_title',
  'paragraph_id',
  'source_text',
  'translated_text',
  'translation_status',
  'human_locked',
  'qa_status',
  'notes',
  'updated_at',
] as const;

export type TranslationSpreadsheetColumn = (typeof TRANSLATION_SPREADSHEET_COLUMNS)[number];

export const TRANSLATION_SPREADSHEET_CONFLICT_STRATEGIES = [
  'KEEP_APP',
  'USE_EXCEL',
] as const;

export type TranslationSpreadsheetConflictStrategy =
  (typeof TRANSLATION_SPREADSHEET_CONFLICT_STRATEGIES)[number];

export const TRANSLATION_SPREADSHEET_WARNINGS = {
  SOURCE_CHANGED: 'SOURCE_CHANGED',
  CONFLICT_APP_NEWER: 'CONFLICT_APP_NEWER',
} as const;
