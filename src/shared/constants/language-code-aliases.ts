/**
 * Canonical BCP-47 normalization — aliases never become persisted catalog codes.
 * Search-only aliases live in LANGUAGE_SEARCH_ALIASES.
 */

/** Persisted / input code → canonical catalog code. */
export const LANGUAGE_CODE_ALIASES: Readonly<Record<string, string>> = {
  jw: 'jv',
  iw: 'he',
  in: 'id',
  ind: 'id',
  heb: 'he',
};

/**
 * Search query token → canonical code (does not persist).
 * Used so "jw" finds Javanese (jv) without a duplicate catalog row.
 */
export const LANGUAGE_SEARCH_ALIASES: Readonly<Record<string, string>> = {
  jw: 'jv',
  jawa: 'jv',
  farsi: 'fa',
  persian: 'fa',
  'ba tu': 'fa',
  'bà tư': 'fa',
  filipino: 'fil',
  tagalog: 'tl',
  hongkong: 'zh-HK',
  'hong kong': 'zh-HK',
  cantonese: 'zh-HK',
  simplified: 'zh-Hans',
  traditional: 'zh-Hant',
  mandarin: 'zh-Hans',
};

export function resolveLanguageSearchAlias(query: string): string | null {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!q) return null;
  return LANGUAGE_SEARCH_ALIASES[q] ?? null;
}
