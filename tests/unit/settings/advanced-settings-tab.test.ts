import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Advanced settings tab (Phase 6)', () => {
  const root = path.resolve(__dirname, '../../../src/renderer');

  it('Advanced panel has consolidated sections', () => {
    const advanced = fs.readFileSync(
      path.join(root, 'components/settings/AdvancedSettingsPanel.tsx'),
      'utf8',
    );

    expect(advanced).toContain('advancedUiSection');
    expect(advanced).toContain('advancedAiSection');
    expect(advanced).toContain('AiProvidersSettingsPanel');
    expect(advanced).toContain('SystemHealthPanel');
    expect(advanced).toContain('UpdatesSettingsPanel');
    expect(advanced).toContain('SettingsDisclosure');
    expect(advanced).not.toContain('currentVersion');
    expect(advanced).not.toContain('developerTools');
    expect(advanced).not.toContain('settings.backup');
  });

  it('parallel advanced controls moved out of translation tab', () => {
    const translation = fs.readFileSync(
      path.join(root, 'components/settings/TranslationSettingsPanel.tsx'),
      'utf8',
    );
    const parallel = fs.readFileSync(
      path.join(root, 'components/settings/AdvancedParallelSettingsPanel.tsx'),
      'utf8',
    );

    expect(translation).not.toContain('parallelWavesTitle');
    expect(parallel).toContain('parallelWavesTitle');
  });

  it('system health IPC wired', () => {
    const preload = fs.readFileSync(
      path.resolve(__dirname, '../../../src/preload/preload.ts'),
      'utf8',
    );
    expect(preload).toContain('runSystemHealth');
  });
});
