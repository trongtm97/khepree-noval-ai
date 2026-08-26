import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'noveltrans-theme' },
  ),
);

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function watchSystemTheme(onChange: (resolved: 'light' | 'dark') => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    onChange(media.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', handler);
  return () => {
    media.removeEventListener('change', handler);
  };
}
