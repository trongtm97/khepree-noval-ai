/** How a Translation Notebook knowledge source is bound. */
export const NOTEBOOK_SOURCE_BINDING_TYPES = [
  'DRIVE_LIVE',
  'STATIC_UPLOAD',
  'COPIED_TEXT',
] as const;

export type NotebookSourceBindingType = (typeof NOTEBOOK_SOURCE_BINDING_TYPES)[number];

export const NOTEBOOK_SOURCE_BINDING_STATUSES = [
  'active',
  'pending',
  'needs_migration',
  'retired',
] as const;

export type NotebookSourceBindingStatus =
  (typeof NOTEBOOK_SOURCE_BINDING_STATUSES)[number];

/** Google Docs preferred for live Notebook knowledge. */
export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

export const MARKDOWN_MIME_TYPE = 'text/markdown';

/**
 * Drive / Notebook display titles for knowledge docs (no .md).
 * Local cache may still use `KNOWLEDGE_FILE_NAMES` (*.md).
 */
export const KNOWLEDGE_DRIVE_DOC_TITLES = {
  book_profile: '00_BOOK_PROFILE',
  translation_rules: '01_TRANSLATION_RULES',
  project_terms: '02_PROJECT_TERMS',
  characters: '03_CHARACTERS',
  relationships: '04_RELATIONSHIPS',
  story_state: '05_STORY_STATE',
  world_knowledge: '06_WORLD_KNOWLEDGE',
  recent_context: '07_RECENT_CONTEXT',
  sync_state: '08_SYNC_STATE',
} as const;

export const DRIVE_PROJECT_DOC_TITLES = [
  '00_BOOK_PROFILE',
  '01_TRANSLATION_RULES',
  '02_PROJECT_TERMS',
  '03_CHARACTERS',
  '04_RELATIONSHIPS',
  '05_STORY_STATE',
  '06_WORLD_KNOWLEDGE',
  '07_RECENT_CONTEXT',
  '08_SYNC_STATE',
] as const;

export type DriveProjectDocTitle = (typeof DRIVE_PROJECT_DOC_TITLES)[number];
