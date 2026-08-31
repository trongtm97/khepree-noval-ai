/** app_meta keys for UI display language (source of truth — not localStorage). */
export const UI_LANGUAGE_META_KEYS = {
  preference: 'settings.ui.language',
  chosen: 'settings.ui.language.chosen',
} as const;

/** Legacy Khepree-phase keys — migrated on read. */
export const LEGACY_UI_LANGUAGE_META_KEYS = {
  khepreeLocale: 'khepree.locale.code',
  khepreeChosen: 'khepree.locale.chosen',
} as const;

export const UI_LANGUAGE_DEFAULT_PREFERENCE = 'vi' as const;
