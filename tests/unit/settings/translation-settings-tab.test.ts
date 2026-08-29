import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Translation settings tab', () => {
  const root = path.resolve(__dirname, '../../../src/renderer');

  it('uses TranslationSettingsPanel without default target language', () => {
    const settingsPage = fs.readFileSync(path.join(root, 'pages/SettingsPage.tsx'), 'utf8');
    const panel = fs.readFileSync(
      path.join(root, 'components/settings/TranslationSettingsPanel.tsx'),
      'utf8',
    );

    expect(settingsPage).toContain('TranslationSettingsPanel');
    expect(settingsPage).not.toContain('SchedulerConcurrencyPanel');
    expect(panel).toContain('translationAutomationTitle');
    expect(panel).not.toContain('defaultTargetLanguage');
    expect(panel).not.toContain('LanguagePicker');
  });

  it('SchedulerConcurrencyPanel removed', () => {
    expect(
      fs.existsSync(path.join(root, 'components/settings/SchedulerConcurrencyPanel.tsx')),
    ).toBe(false);
  });
});
