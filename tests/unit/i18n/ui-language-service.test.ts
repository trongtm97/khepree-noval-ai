import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveAppPaths } from '@main/services/paths-service';
import {
  closeDatabase,
  createDatabaseManager,
  type DatabaseManager,
} from '@main/db/connection';
import { UiLanguageService } from '@main/services/ui-language-service';
import { SETUP_META_KEYS } from '@shared/constants/setup';
import {
  LEGACY_UI_LANGUAGE_META_KEYS,
  UI_LANGUAGE_META_KEYS,
} from '@shared/constants/ui-language';

vi.mock('electron', () => ({
  app: {
    getLocale: () => 'en-US',
    isPackaged: false,
  },
}));

describe('UiLanguageService', () => {
  let tempRoot: string;
  let db: DatabaseManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-ui-lang-'));
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(paths.backups, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows may keep db handle briefly after close
    }
  });

  it('fresh install needs first-run chooser', () => {
    const service = new UiLanguageService(() => db);
    const status = service.getStatus();
    expect(status.needsFirstRunChooser).toBe(true);
    expect(status.chosen).toBe(false);
  });

  it('completeFirstRun persists en to app_meta', () => {
    const service = new UiLanguageService(() => db);
    const status = service.completeFirstRun('en');
    expect(status.chosen).toBe(true);
    expect(status.needsFirstRunChooser).toBe(false);
    expect(status.preference).toBe('en');
    expect(db.appMeta.get(UI_LANGUAGE_META_KEYS.preference)).toBe('en');
    expect(db.appMeta.get(UI_LANGUAGE_META_KEYS.chosen)).toBe('1');
  });

  it('existing install auto-chooses from OS without blocking gate', () => {
    db.appMeta.set(SETUP_META_KEYS.completed, '1');
    const service = new UiLanguageService(() => db);
    const status = service.getStatus();
    expect(status.chosen).toBe(true);
    expect(status.needsFirstRunChooser).toBe(false);
    expect(status.locale).toBe('en');
  });

  it('migrates legacy khepree locale keys', () => {
    db.appMeta.set(LEGACY_UI_LANGUAGE_META_KEYS.khepreeLocale, 'vi');
    db.appMeta.set(LEGACY_UI_LANGUAGE_META_KEYS.khepreeChosen, '1');
    db.appMeta.set(SETUP_META_KEYS.explored, '1');
    const service = new UiLanguageService(() => db);
    const status = service.getStatus();
    expect(status.preference).toBe('vi');
    expect(status.chosen).toBe(true);
    expect(db.appMeta.get(UI_LANGUAGE_META_KEYS.preference)).toBe('vi');
  });
});
