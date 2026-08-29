import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Language tab settings IA', () => {
  const root = path.resolve(__dirname, '../../../src/renderer');

  it('SettingsPage routes language settings to Language tab only', () => {
    const settingsPage = fs.readFileSync(path.join(root, 'pages/SettingsPage.tsx'), 'utf8');
    const languagePanel = fs.readFileSync(
      path.join(root, 'components/settings/LanguageSettingsPanel.tsx'),
      'utf8',
    );

    expect(settingsPage).toContain('LanguageSettingsPanel');
    expect(settingsPage).toMatch(/tab === 'language'[\s\S]*LanguageSettingsPanel/);
    expect(languagePanel).toContain('defaultTargetLanguage');
    expect(languagePanel).not.toContain('parallelWavesTitle');
  });

  it('Translation tab uses separate automation panel', () => {
    expect(
      fs.existsSync(path.join(root, 'components/settings/TranslationSettingsPanel.tsx')),
    ).toBe(true);
  });
});
