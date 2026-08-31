import { LOCALE_STORAGE_KEY } from '@shared/constants/app';
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  normalizeUiLocalePreference,
  resolveUiLocale,
  type UiLocaleCode,
  type UiLocalePreference,
} from '@shared/types/ui-locale';
import { vi, type LocaleMessages } from './vi';
import { en } from './en';

/** @deprecated Use UiLocaleCode from @shared/types/ui-locale */
export type LocaleCode = UiLocaleCode;

export type { UiLocaleCode, UiLocalePreference, TranslationLanguageCode } from '@shared/types/ui-locale';

const catalogs: Record<UiLocaleCode, LocaleMessages> = { vi, en };

interface LocaleState {
  preference: UiLocalePreference;
  setPreference: (preference: UiLocalePreference) => void;
  /** @deprecated Use setPreference with vi | en */
  setLocale: (locale: UiLocaleCode) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      preference: 'vi',
      setPreference: (preference) => {
        const normalized = normalizeUiLocalePreference(preference);
        const resolved = resolveUiLocale(normalized);
        if (!(resolved in catalogs)) {
          throw new Error('LOCALE_CATALOG_MISSING');
        }
        set({ preference: normalized });
      },
      setLocale: (locale) => {
        get().setPreference(locale);
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: 1,
      migrate: (persisted: unknown) => {
        if (!persisted || typeof persisted !== 'object') {
          return { preference: 'vi' satisfies UiLocalePreference };
        }
        const row = persisted as { preference?: unknown; locale?: unknown };
        if (row.preference !== undefined) {
          return { preference: normalizeUiLocalePreference(row.preference) };
        }
        if (row.locale === 'vi' || row.locale === 'en') {
          return { preference: row.locale };
        }
        return { preference: 'vi' satisfies UiLocalePreference };
      },
    },
  ),
);

type Params = Record<string, string | number>;

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function getResolvedUiLocale(): UiLocaleCode {
  return resolveUiLocale(useLocaleStore.getState().preference);
}

export function t(key: string, params?: Params, locale?: UiLocaleCode): string {
  const code = locale ?? getResolvedUiLocale();
  const catalog = catalogs[code];
  const raw = getByPath(catalog, key);
  let text = typeof raw === 'string' ? raw : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function useT(): (key: string, params?: Params) => string {
  const preference = useLocaleStore((s) => s.preference);
  const locale = useMemo(() => resolveUiLocale(preference), [preference]);
  return useCallback((key, params) => t(key, params, locale), [locale]);
}

export { vi, en };
export type { LocaleMessages };
