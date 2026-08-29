/** Canonical Settings tab IDs (Phase 1 IA). */
export type SettingsTab =
  | 'general'
  | 'language'
  | 'translation'
  | 'ai'
  | 'storage'
  | 'advanced';

export const SETTINGS_TABS: SettingsTab[] = [
  'general',
  'language',
  'translation',
  'ai',
  'storage',
  'advanced',
];

/** Maps legacy ?tab= values from pre-Phase-1 Settings to new tabs. */
const LEGACY_TAB_MAP: Record<string, SettingsTab> = {
  appearance: 'general',
  export: 'storage',
  aiProviders: 'ai',
  aiDiagnostics: 'advanced',
  googleAi: 'ai',
};

export function isSettingsTab(value: string): value is SettingsTab {
  return (SETTINGS_TABS as string[]).includes(value);
}

export function parseSettingsTab(raw: string | null): SettingsTab {
  if (!raw) return 'general';
  if (isSettingsTab(raw)) return raw;
  return LEGACY_TAB_MAP[raw] ?? 'general';
}

export function settingsTabSearchParams(tab: SettingsTab): Record<string, string> {
  return tab === 'general' ? {} : { tab };
}
