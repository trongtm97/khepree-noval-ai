/**
 * Integration smoke: setup → project → terms → backup path equality.
 * Runs in Node (no Electron window).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, closeDatabase, getDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { SetupService } from '@main/services/setup-service';
import { createManualDbBackup } from '@main/portability/auto-backup';
import { newId } from '@main/db/utils/uuid';
import { utcNow } from '@main/db/utils/timestamps';

describe('Integration smoke (release)', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-int-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('setup complete + project insert + manual DB backup preserves file', () => {
    const setup = new SetupService(() => getDatabase());
    setup.setStep('createProject');
    setup.complete(true);
    expect(setup.getStatus().completed).toBe(true);

    const db = getDatabase().getConnection();
    const now = utcNow();
    const projectId = newId();
    db.prepare(
      `INSERT INTO projects (id, title, source_language, target_language, status, created_at, updated_at)
       VALUES (?, ?, 'zh', 'vi', 'active', ?, ?)`,
    ).run(projectId, 'Integration Novel', now, now);

    const termId = newId();
    db.prepare(
      `INSERT INTO terms (
        id, source_simplified, term_type, scope, scope_ref, status,
        confidence, occurrence_count, novel_count, locked, created_at, updated_at
      ) VALUES (?, '龙', 'other', 'PROJECT', ?, 'ACTIVE', 0.9, 1, 1, 0, ?, ?)`,
    ).run(termId, projectId, now, now);

    db.prepare(
      `INSERT INTO term_translations (id, term_id, target_text, is_primary, created_at, updated_at)
       VALUES (?, ?, 'rồng', 1, ?, ?)`,
    ).run(newId(), termId, now, now);

    const backupPath = createManualDbBackup(
      getDatabase().dbPath,
      pathsService.getPath('backups'),
    );
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.statSync(backupPath).size).toBeGreaterThan(1000);

    const term = db
      .prepare(
        `SELECT tt.target_text AS target
         FROM terms t
         JOIN term_translations tt ON tt.term_id = t.id
         WHERE t.source_simplified = ?`,
      )
      .get('龙') as { target: string };
    expect(term.target).toBe('rồng');
  });
});
