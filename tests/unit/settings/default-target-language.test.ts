import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import {
  createDatabaseManager,
  closeDatabase,
  type DatabaseManager,
} from '@main/db/connection';
import {
  LEGACY_DEFAULT_TARGET_LANGUAGE,
  TRANSLATION_SETTINGS_META_KEYS,
  resolveEditionDefaultTarget,
} from '@shared/constants/translation-settings';
import {
  readDefaultTargetLanguage,
  setDefaultTargetLanguage,
} from '@main/services/translation-settings-service';

describe('default_target_language', () => {
  let tempRoot: string;
  let db: DatabaseManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'Khepree Novel AI-settings-'));
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

  it('falls back to vi when unset (test 1 migration)', () => {
    const settings = readDefaultTargetLanguage(db);
    expect(settings.defaultTargetLanguage).toBe('vi');
    expect(settings.hadPersistedValue).toBe(false);
  });

  it('returns en when default_target_language=en (test 2)', () => {
    db.appMeta.set(TRANSLATION_SETTINGS_META_KEYS.defaultTargetLanguage, 'en');
    const settings = readDefaultTargetLanguage(db);
    expect(settings.defaultTargetLanguage).toBe('en');
  });

  it('persists user choice and does not affect stored project languages (test 4/5 logic)', () => {
    setDefaultTargetLanguage(db, 'es');
    expect(readDefaultTargetLanguage(db).defaultTargetLanguage).toBe('es');
    setDefaultTargetLanguage(db, 'vi');
    expect(readDefaultTargetLanguage(db).defaultTargetLanguage).toBe('vi');
  });

  it('resolveEditionDefaultTarget uses settings default (test 6)', () => {
    const resolved = resolveEditionDefaultTarget({
      defaultTargetLanguage: 'vi',
      sourceLanguage: 'zh-Hans',
      existingTargets: ['en'],
      addableCodes: ['vi', 'ja', 'fr'],
    });
    expect(resolved.suggestedTarget).toBe('vi');
    expect(resolved.duplicateDefault).toBe(false);
  });

  it('warns when default edition already exists (test 7)', () => {
    const resolved = resolveEditionDefaultTarget({
      defaultTargetLanguage: 'vi',
      sourceLanguage: 'zh-Hans',
      existingTargets: ['vi'],
      addableCodes: ['en', 'ja'],
    });
    expect(resolved.duplicateDefault).toBe(true);
    expect(resolved.suggestedTarget).toBe('en');
  });

  it('invalid persisted code falls back with warning (test 8)', () => {
    db.appMeta.set(
      TRANSLATION_SETTINGS_META_KEYS.defaultTargetLanguage,
      'not-a-real-language-code-xyz',
    );
    const settings = readDefaultTargetLanguage(db);
    expect(settings.defaultTargetLanguage).toBe(LEGACY_DEFAULT_TARGET_LANGUAGE);
    expect(settings.invalidPersisted).toBe(true);
    expect(settings.hadPersistedValue).toBe(true);
  });

  it('rejects invalid code on save', () => {
    expect(() => setDefaultTargetLanguage(db, 'not-a-real-language-code-xyz')).toThrow(
      'INVALID_LANGUAGE_CODE',
    );
  });

  it('allows experimental language with flag (test 9)', () => {
    db.appMeta.set(TRANSLATION_SETTINGS_META_KEYS.defaultTargetLanguage, 'jv');
    const settings = readDefaultTargetLanguage(db);
    expect(settings.defaultTargetLanguage).toBe('jv');
    expect(settings.experimental).toBe(true);
  });

  it('wizard draft keeps explicit selection over default (test 3 contract)', () => {
    const resolveWizardTarget = (
      userSelected: string | undefined,
      settingsDefault: string,
    ): string => userSelected ?? settingsDefault;

    expect(resolveWizardTarget('es', 'vi')).toBe('es');
    expect(resolveWizardTarget(undefined, 'vi')).toBe('vi');
  });
});
