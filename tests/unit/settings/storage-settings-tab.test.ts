import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Storage settings tab (Phase 5)', () => {
  const root = path.resolve(__dirname, '../../../src/renderer');

  it('uses StorageSettingsPanel on storage tab', () => {
    const settingsPage = fs.readFileSync(path.join(root, 'pages/SettingsPage.tsx'), 'utf8');
    const panel = fs.readFileSync(
      path.join(root, 'components/settings/StorageSettingsPanel.tsx'),
      'utf8',
    );

    expect(settingsPage).toContain('StorageSettingsPanel');
    expect(settingsPage).not.toContain('ExportSettingsPanel');
    expect(panel).toContain('setupStorageRoot');
    expect(panel).toContain('storageAutoBackupTitle');
    expect(panel).toContain('storageBackupNow');
    expect(panel).toContain('storageRestorePick');
    expect(panel).toContain('SettingsDisclosure');
    expect(panel).toContain('storageRetentionSummary');
  });

  it('exposes storage IPC channels', () => {
    const channels = fs.readFileSync(
      path.resolve(__dirname, '../../../src/shared/constants/ipc-channels.ts'),
      'utf8',
    );
    const preload = fs.readFileSync(
      path.resolve(__dirname, '../../../src/preload/preload.ts'),
      'utf8',
    );

    expect(channels).toContain('PORTABILITY_SETUP_STORAGE_ROOT');
    expect(channels).toContain('PORTABILITY_CHECK_STORAGE_HEALTH');
    expect(channels).toContain('PORTABILITY_BACKUP_NOW');
    expect(preload).toContain('setupStorageRoot');
    expect(preload).toContain('checkStorageHealth');
    expect(preload).toContain('backupNow');
  });

  it('Advanced maintenance links novel export for power users', () => {
    const advanced = fs.readFileSync(
      path.join(root, 'components/settings/AdvancedSettingsPanel.tsx'),
      'utf8',
    );
    expect(advanced).toContain('advancedMaintenanceSection');
    expect(advanced).toContain("navigate('/export')");
  });
});
