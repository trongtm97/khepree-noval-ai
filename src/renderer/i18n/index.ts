import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { vi, type LocaleMessages } from './vi';
import { en } from './en';

export type LocaleCode = 'vi' | 'en';

const catalogs: Record<LocaleCode, LocaleMessages> = { vi, en };

interface LocaleState {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'vi',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'noveltrans-locale' },
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

export function t(key: string, params?: Params, locale?: LocaleCode): string {
  const code = locale ?? useLocaleStore.getState().locale;
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
  const locale = useLocaleStore((s) => s.locale);
  return useCallback((key, params) => t(key, params, locale), [locale]);
}

export { vi, en };
export type { LocaleMessages };
