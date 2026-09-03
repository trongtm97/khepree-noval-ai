/** Local library full-text search (Prompt 17). */

export const LIBRARY_SEARCH_ENTITY_TYPES = [
  'project',
  'chapter',
  'term',
  'character',
  'translation',
  'qa_finding',
  'series',
] as const;

export type LibrarySearchEntityType = (typeof LIBRARY_SEARCH_ENTITY_TYPES)[number];

export const LIBRARY_SEARCH_INDEX_RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type LibrarySearchIndexRunStatus =
  (typeof LIBRARY_SEARCH_INDEX_RUN_STATUSES)[number];

export const LIBRARY_SEARCH_META_KEYS = {
  indexSourceText: 'library_search.index_source_text',
  indexTranslationText: 'library_search.index_translation_text',
  lastFullReindexAt: 'library_search.last_full_reindex_at',
} as const;

export const DEFAULT_INDEX_SOURCE_TEXT = true;
export const DEFAULT_INDEX_TRANSLATION_TEXT = true;

export const LIBRARY_SEARCH_DEFAULT_LIMIT = 25;
export const LIBRARY_SEARCH_MAX_LIMIT = 100;

export const LIBRARY_SEARCH_REINDEX_BATCH_SIZE = 40;
export const LIBRARY_SEARCH_DIRTY_BATCH_SIZE = 25;
