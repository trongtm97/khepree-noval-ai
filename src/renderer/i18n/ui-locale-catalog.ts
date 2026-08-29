import type { UiLocaleCode } from '@shared/types/ui-locale';

export interface UiLocaleCatalogEntry {
  code: UiLocaleCode;
  internationalName: string;
  nativeName: string;
}

/** UI locale catalog — separate from WORLD_LANGUAGE_CATALOG. */
export const UI_LOCALE_CATALOG: readonly UiLocaleCatalogEntry[] = [
  { code: 'vi', internationalName: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'en', internationalName: 'English', nativeName: 'English' },
] as const;

export function getUiLocaleCatalogEntry(code: UiLocaleCode): UiLocaleCatalogEntry {
  const found = UI_LOCALE_CATALOG.find((e) => e.code === code);
  if (!found) return UI_LOCALE_CATALOG[0];
  return found;
}

export function formatUiLocaleStacked(code: UiLocaleCode): {
  internationalName: string;
  nativeLine: string;
} {
  const entry = getUiLocaleCatalogEntry(code);
  return {
    internationalName: entry.internationalName,
    nativeLine: `${entry.nativeName} · ${entry.code}`,
  };
}
