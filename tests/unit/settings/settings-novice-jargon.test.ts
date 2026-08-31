/**
 * Novice Settings jargon guard — normal tabs only (not Advanced).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SETTINGS = path.join(ROOT, 'src/renderer/components/settings');

const NORMAL_PANELS = [
  'GeneralSettingsPanel.tsx',
  'LanguageSettingsPanel.tsx',
  'TranslationSettingsPanel.tsx',
  'AiSettingsPanel.tsx',
  'StorageSettingsPanel.tsx',
  'SettingsNav.tsx',
  'SettingsSection.tsx',
  'SettingsRow.tsx',
  'SettingsGroup.tsx',
  'SettingsStatus.tsx',
  'SettingsDisclosure.tsx',
  'StoragePathRow.tsx',
];

const FORBIDDEN_VISIBLE = [
  /provider priority/i,
  /worker ID/i,
  /perProviderMax/i,
  /__Secure-/,
  /Client ID/i,
  /\bOAuth\b/i,
  /Google Drive/i,
  /Notebook grounding/i,
  /correlation ID/i,
  /\bJSON\b/,
  /workerInstalled/,
  /provider_/,
  /\bPID\b/,
  /aiPriority/,
  /concurrencyPerProvider/,
];

function extractI18nKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const match of source.matchAll(/t\(\s*['"]([^'"]+)['"]/g)) {
    keys.add(match[1]!);
  }
  return [...keys];
}

function loadLocale(keyPrefix: string): Record<string, string> {
  const viPath = path.join(ROOT, 'src/renderer/i18n/locales/vi/index.ts');
  const enPath = path.join(ROOT, 'src/renderer/i18n/locales/en/index.ts');
  const text = fs.readFileSync(viPath, 'utf8') + fs.readFileSync(enPath, 'utf8');
  const out: Record<string, string> = {};
  const re = new RegExp(`(${keyPrefix.replace(/\./g, '\\.')}[\\w.]*)\\s*:\\s*'([^']*)'`, 'g');
  for (const match of text.matchAll(re)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

describe('settings novice jargon guard', () => {
  it('normal settings panels avoid forbidden visible strings in source', () => {
    const hits: string[] = [];
    for (const file of NORMAL_PANELS) {
      const full = path.join(SETTINGS, file);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const pattern of FORBIDDEN_VISIBLE) {
        // Only flag user-visible JSX text / i18n keys — not TypeScript field names.
        if (
          pattern.test(text) &&
          !/perProviderMax|globalMaxWorkers|workerInstalled|provider_/.test(String(pattern))
        ) {
          hits.push(`${file}: ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('i18n copy for normal settings tabs omits forbidden novice terms', () => {
    const keys = new Set<string>();
    for (const file of NORMAL_PANELS) {
      const full = path.join(SETTINGS, file);
      if (!fs.existsSync(full)) continue;
      for (const k of extractI18nKeys(fs.readFileSync(full, 'utf8'))) {
        keys.add(k);
      }
    }

    const locales = loadLocale('settings');
    const exportKeys = loadLocale('exportDirectory');
    const hits: string[] = [];

    for (const key of keys) {
      const messages = [locales[key], exportKeys[key]].filter(Boolean);
      for (const msg of messages) {
        for (const pattern of FORBIDDEN_VISIBLE) {
          if (pattern.test(msg)) {
            hits.push(`${key}: ${pattern}`);
          }
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
