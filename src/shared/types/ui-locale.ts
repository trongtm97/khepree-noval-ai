/** Completed UI translation locales — not world translation languages. */
export type UiLocaleCode = 'vi' | 'en';

/** User preference; `system` resolves via OS/browser locale. */
export type UiLocalePreference = 'system' | UiLocaleCode;

/** Canonical code from world language catalog — not a UI locale. */
export type TranslationLanguageCode = string;

export const UI_LOCALE_CODES: readonly UiLocaleCode[] = ['vi', 'en'] as const;

export function isUiLocaleCode(value: string): value is UiLocaleCode {
  return (UI_LOCALE_CODES as readonly string[]).includes(value);
}

export function isUiLocalePreference(value: string): value is UiLocalePreference {
  return value === 'system' || isUiLocaleCode(value);
}

export function normalizeUiLocalePreference(raw: unknown): UiLocalePreference {
  if (typeof raw === 'string' && isUiLocalePreference(raw)) return raw;
  if (typeof raw === 'string' && isUiLocaleCode(raw)) return raw;
  return 'vi';
}

/** Resolve OS/browser locale to a supported UI locale; product fallback `vi`. */
export function resolveSystemUiLocale(
  languages: readonly string[] = typeof navigator !== 'undefined'
    ? navigator.languages.length > 0
      ? [...navigator.languages]
      : navigator.language
        ? [navigator.language]
        : []
    : [],
): UiLocaleCode {
  for (const raw of languages) {
    const base = raw.split('-')[0]?.toLowerCase();
    if (base === 'en') return 'en';
    if (base === 'vi') return 'vi';
  }
  return 'vi';
}

export function resolveUiLocale(preference: UiLocalePreference): UiLocaleCode {
  if (preference === 'system') return resolveSystemUiLocale();
  return preference;
}
