import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  resolvePrimaryNotebookBinding,
  listDuplicateBindingCandidates,
} from '@main/notebook/notebook-binding-duplicate-audit';

describe('Notebook duplicate primary resolver', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-dup-res-'));
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

  it('user picks primary; others locally deprecated; remote ids kept', () => {
    const db = getDatabase();
    const projectId = db.projects.create({ title: 'Dup Story' }).id;
    const a1 = db.googleAccounts.create({
      label: 'acc1',
      email: 'd1@example.com',
      profileDirName: 'dup-p1',
      status: 'READY',
    });
    const a2 = db.googleAccounts.create({
      label: 'acc2',
      email: 'd2@example.com',
      profileDirName: 'dup-p2',
      status: 'READY',
    });

    const raw = db.getConnection();
    raw
      .prepare(
        `INSERT INTO notebook_resources (
          id, project_id, notebook_id, resource_url, status,
          google_account_id, notebook_name, notebook_role,
          last_verified_at, knowledge_version, created_at, updated_at
        ) VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ?, 'remote-a',
         'https://notebooklm.google.com/notebook/remote-a', 'ready', ?, 'Candidate A', 'SINGLE',
         '2026-09-01T00:00:00.000Z', 1, datetime('now'), datetime('now')),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', ?, 'remote-b',
         'https://notebooklm.google.com/notebook/remote-b', 'ready', ?, 'Candidate B', 'SINGLE',
         '2026-09-02T00:00:00.000Z', 1, datetime('now'), datetime('now'))`,
      )
      .run(projectId, a1.id, projectId, a2.id);

    const candidates = listDuplicateBindingCandidates(raw, projectId);
    expect(candidates.length).toBe(2);

    const result = resolvePrimaryNotebookBinding(raw, {
      projectId,
      primaryRowId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(result.primaryId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result.deprecatedIds).toContain('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    const primary = db.notebooks.getById('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    const secondary = db.notebooks.getById('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(primary?.deprecated_at).toBeNull();
    expect(primary?.notebook_id).toBe('remote-a');
    expect(secondary?.deprecated_at).toBeTruthy();
    expect(secondary?.notebook_id).toBe('remote-b');
  });
});
