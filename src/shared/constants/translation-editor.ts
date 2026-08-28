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

/**
 * Virtualizer estimate only (px). Never used as the rendered row height —
 * measured content (source, target, markers) determines layout.
 */
export const EDITOR_ROW_HEIGHT = 72;

/** Extra virtualized rows rendered outside the viewport. */
export const EDITOR_OVERSCAN = 6;
