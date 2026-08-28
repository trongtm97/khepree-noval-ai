export const SOURCE_WORKBOOK_SHEETS = ['CHAPTERS', 'PARAGRAPHS'] as const;
export type SourceWorkbookSheet = (typeof SOURCE_WORKBOOK_SHEETS)[number];

export const SOURCE_WORKBOOK_COMMIT_ORDER: SourceWorkbookSheet[] = ['CHAPTERS', 'PARAGRAPHS'];

export const SOURCE_WORKBOOK_IMPORT_MODES = [
  'METADATA_ONLY',
  'UPDATE_SOURCE_CONTENT',
] as const;
export type SourceWorkbookImportMode = (typeof SOURCE_WORKBOOK_IMPORT_MODES)[number];

export const CHAPTERS_TABULAR_COLUMNS = [
  'chapter_id',
  'chapter_number',
  'chapter_type',
  'title',
  'sequence_order',
  'source_status',
  'translated_status',
] as const;

export const PARAGRAPHS_TABULAR_COLUMNS = [
  'chapter_id',
  'paragraph_id',
  'sequence',
  'source_text',
] as const;

export const SOURCE_WORKBOOK_WARNINGS = {
  SOURCE_OVERWRITE_BLOCKED: 'SOURCE_OVERWRITE_BLOCKED',
  PARAGRAPH_ID_REQUIRED: 'PARAGRAPH_ID_REQUIRED',
  CHAPTER_NOT_FOUND: 'CHAPTER_NOT_FOUND',
  PARAGRAPH_NOT_FOUND: 'PARAGRAPH_NOT_FOUND',
  SOURCE_CHANGED: 'SOURCE_CHANGED',
  NEEDS_RETRANSLATION: 'NEEDS_RETRANSLATION',
} as const;
