import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { NOVELTRANS_APPDATA_DIR } from '@shared/constants/db';
import { resolveAppPaths } from '@main/services/paths-service';

describe('resolveAppPaths', () => {
  it('builds paths under AppData/NovelTrans without hardcoded drive letters', () => {
    const appData = path.join(os.tmpdir(), 'appdata-test');
    const paths = resolveAppPaths(appData);

    expect(paths.root).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR));
    expect(paths.data).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR, 'data'));
    expect(paths.logs).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR, 'logs'));
    expect(paths.browserProfiles).toBe(
      path.join(appData, NOVELTRANS_APPDATA_DIR, 'browser-profiles'),
    );
    expect(paths.exports).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR, 'exports'));
    expect(paths.backups).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR, 'backups'));
    expect(paths.cache).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR, 'cache'));
  });

  it('uses platform-neutral path joining', () => {
    const appData = '/var/app';
    const paths = resolveAppPaths(appData);
    expect(paths.logs).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR, 'logs'));
  });
});

describe('PathsService.isManagedPath logic', () => {
  const appData = path.join(os.tmpdir(), 'noveltrans-managed-test');
  const paths = resolveAppPaths(appData);

  afterEach(() => {
    if (fs.existsSync(appData)) {
      fs.rmSync(appData, { recursive: true, force: true });
    }
  });

  it('accepts paths inside managed directories', () => {
    const logsFile = path.join(paths.logs, 'noveltrans.log');
    const normalized = path.resolve(logsFile);
    const managed = Object.values(paths).some((managedPath) => {
      const base = path.resolve(managedPath);
      return normalized === base || normalized.startsWith(`${base}${path.sep}`);
    });
    expect(managed).toBe(true);
  });

  it('rejects paths outside managed directories', () => {
    const outside = path.resolve(os.tmpdir(), 'outside-noveltrans');
    const managed = Object.values(paths).some((managedPath) => {
      const base = path.resolve(managedPath);
      return outside === base || outside.startsWith(`${base}${path.sep}`);
    });
    expect(managed).toBe(false);
  });
});
