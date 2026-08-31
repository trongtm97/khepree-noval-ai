import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('AI settings tab (Phase 4)', () => {
  const root = path.resolve(__dirname, '../../../src/renderer');

  it('normal AI tab uses AiSettingsPanel only', () => {
    const settingsPage = fs.readFileSync(path.join(root, 'pages/SettingsPage.tsx'), 'utf8');
    const aiPanel = fs.readFileSync(
      path.join(root, 'components/settings/AiSettingsPanel.tsx'),
      'utf8',
    );

    expect(settingsPage).toContain('AiSettingsPanel');
    expect(settingsPage).not.toContain('AiProvidersSettingsPanel');
    expect(aiPanel).toContain('autoSetupRun');
    expect(aiPanel).toContain('aiAutoSetup');
    expect(aiPanel).toContain('AiPreferencePanel');
    expect(aiPanel).not.toContain('ProjectPrimaryProviderPanel');
    expect(aiPanel).not.toContain('PreferNotebookPackToggle');
    expect(aiPanel).not.toContain('__Secure-1PSID');
    expect(aiPanel).not.toContain('aiPriority');
    expect(aiPanel).not.toContain('aiDiagBrowser');
  });

  it('advanced tab hosts providers, manual connect, and diagnostics', () => {
    const advanced = fs.readFileSync(
      path.join(root, 'components/settings/AdvancedSettingsPanel.tsx'),
      'utf8',
    );
    const providers = fs.readFileSync(
      path.join(root, 'components/settings/AiProvidersSettingsPanel.tsx'),
      'utf8',
    );
    const manual = fs.readFileSync(
      path.join(root, 'components/settings/AiWebApiManualConnectPanel.tsx'),
      'utf8',
    );

    expect(advanced).toContain('AiProvidersSettingsPanel');
    expect(advanced).toContain('PreferNotebookPackToggle');
    expect(advanced).toContain('AiWebApiManualConnectPanel');
    expect(advanced).toContain('AiDiagnosticsSettingsPanel');
    expect(providers).not.toContain('aiAddAccount');
    expect(providers).not.toContain('__Secure-1PSID');
    expect(manual).toContain('__Secure-1PSID');
    expect(manual).toContain('advancedWebApiManualWarning');
  });

  it('IPC exposes auto setup channels', () => {
    const channels = fs.readFileSync(
      path.resolve(__dirname, '../../../src/shared/constants/ipc-channels.ts'),
      'utf8',
    );
    const preload = fs.readFileSync(
      path.resolve(__dirname, '../../../src/preload/preload.ts'),
      'utf8',
    );

    expect(channels).toContain('AI_AUTO_SETUP_RUN');
    expect(channels).toContain('AI_AUTO_SETUP_STATUS');
    expect(preload).toContain('autoSetupRun');
    expect(preload).toContain('autoSetupStatus');
  });
});
