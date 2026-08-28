import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { atomicBackupDatabase } from '@main/db/backup';
import { applyTieredRetention, listBackupFiles } from '@main/portability/auto-backup';

describe('atomic backup + tiered retention (Phase 8)', () => {
  let tempRoot: string;
  let dbPath: string;
  let backupsDir: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-backup-'));
    backupsDir = path.join(tempRoot, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    dbPath = path.join(tempRoot, 'noveltrans.db');
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);
      INSERT INTO t (v) VALUES ('seed');`);
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('atomicBackupDatabase produces readable consistent copy', () => {
    const target = path.join(backupsDir, 'copy.db');
    atomicBackupDatabase(dbPath, target);
    const backup = new Database(target, { readonly: true });
    try {
      const row = backup.prepare(`SELECT v FROM t LIMIT 1`).get() as { v: string };
      expect(row.v).toBe('seed');
    } finally {
      backup.close();
    }
  });

  it('applyTieredRetention keeps daily/weekly/monthly buckets', () => {
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamps = [
      '2026-08-28T10:00:00.000Z',
      '2026-08-27T10:00:00.000Z',
      '2026-08-20T10:00:00.000Z',
      '2026-07-15T10:00:00.000Z',
      '2026-06-01T10:00:00.000Z',
    ];
    for (const [i, stamp] of stamps.entries()) {
      const file = path.join(backupsDir, `noveltrans-auto-${i}.nts-backup.zip`);
      fs.writeFileSync(file, 'x');
      fs.utimesSync(file, new Date(stamp), new Date(stamp));
    }

    applyTieredRetention(backupsDir, { daily: 2, weekly: 2, monthly: 2 });
    const remaining = listBackupFiles(backupsDir).filter((b) => b.kind === 'auto');
    expect(remaining.length).toBeGreaterThanOrEqual(2);
    expect(remaining.length).toBeLessThanOrEqual(5);
  });
});
