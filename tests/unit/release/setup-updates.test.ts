import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, closeDatabase, getDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { SetupService } from '@main/services/setup-service';
import {
  ManualPlaceholderUpdateProvider,
  checkForUpdates,
  setUpdateProvider,
} from '@main/updates/update-provider';
import { newId } from '@main/db/utils/uuid';

describe('Setup wizard + updates (release)', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-setup-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    setUpdateProvider(new ManualPlaceholderUpdateProvider());
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('tracks setup steps and completes without wiping storage path', () => {
    const service = new SetupService(() => getDatabase());
    expect(service.getStatus().completed).toBe(false);
    expect(service.getStatus().step).toBe('welcome');
    expect(service.getStatus().storageRoot).toContain('NovelTrans');

    service.setStep('storage');
    service.setStep('googleAccount');
    service.setSkipDrive(true);
    expect(service.getStatus().skippedDrive).toBe(true);

    const done = service.complete(true);
    expect(done.completed).toBe(true);
    expect(service.getStatus().completed).toBe(true);
    expect(fs.existsSync(pathsService.getPath('data'))).toBe(true);
  });

  it('manual update provider reports unavailable (no fake server)', async () => {
    const result = await checkForUpdates('0.1.0');
    expect(result.status).toBe('unavailable');
    expect(result.latestVersion).toBeNull();
    expect(result.downloadUrl).toBeNull();
    expect(result.message.toLowerCase()).toContain('no production update server');
  });

  it('AppData layout has data + browserProfiles + backups dirs', () => {
    const paths = pathsService.getPaths();
    for (const key of ['data', 'browserProfiles', 'backups', 'logs', 'exports', 'cache'] as const) {
      expect(fs.existsSync(paths[key])).toBe(true);
    }
    // Must not be under a temp install-like path that upgrades would wipe
    expect(paths.root.endsWith(`${path.sep}NovelTrans`) || paths.root.includes('NovelTrans')).toBe(
      true,
    );
    void newId;
  });
});
