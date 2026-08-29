import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STORAGE_ROOT_BACKUP_SUBDIR,
  STORAGE_ROOT_EXPORT_SUBDIR,
} from '../../../src/shared/constants/portability';
import { setupStorageRoot } from '../../../src/main/portability/storage-setup-service';

function mockDb() {
  const meta = new Map<string, string>();
  return {
    appMeta: {
      get: (key: string) => meta.get(key) ?? null,
      set: (key: string, value: string) => {
        meta.set(key, value);
      },
      delete: (key: string) => {
        meta.delete(key);
      },
    },
  } as never;
}

describe('storage-setup-service', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it('creates separate Exports and Backups under chosen root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-storage-'));
    roots.push(root);
    const db = mockDb();

    const result = setupStorageRoot(db, root);

    expect(result.exportDirectory).toBe(path.join(root, STORAGE_ROOT_EXPORT_SUBDIR));
    expect(result.backupDirectory).toBe(path.join(root, STORAGE_ROOT_BACKUP_SUBDIR));
    expect(fs.existsSync(result.exportDirectory)).toBe(true);
    expect(fs.existsSync(result.backupDirectory)).toBe(true);
    expect(db.appMeta.get('export.defaultDirectory')).toBe(result.exportDirectory);
    expect(db.appMeta.get('backup.dir')).toBe(result.backupDirectory);
  });
});
