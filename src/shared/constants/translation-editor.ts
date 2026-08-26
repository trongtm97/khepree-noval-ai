/** Translation editor version sources (Phase 17). */
export const TRANSLATION_VERSION_SOURCES = [
  'AI_INITIAL',
  'AI_REPAIR',
  'HUMAN_EDIT',
  'SYSTEM_TERM_FIX',
] as const;

export type TranslationVersionSource = (typeof TRANSLATION_VERSION_SOURCES)[number];

export const TRANSLATION_EDITOR_STATUSES = [
  'draft',
  'pending',
  'translated',
  'reviewed',
  'qa_warning',
] as const;

export type TranslationEditorStatus = (typeof TRANSLATION_EDITOR_STATUSES)[number];

/** Autosave debounce (ms). */
export const EDITOR_AUTOSAVE_MS = 800;

/** Virtual row height estimate (px). */
export const EDITOR_ROW_HEIGHT = 72;

/** Rows rendered outside viewport. */
export const EDITOR_OVERSCAN = 6;
