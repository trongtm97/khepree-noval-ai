import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { auditHistoricalNotebookBindingDuplicates } from '@main/notebook/notebook-binding-duplicate-audit';
import { runMigration057NotebookBindingDuplicateAudit } from '@main/db/migrations/057-notebook-binding-duplicate-audit';

describe('HR14 historical notebook binding duplicate audit', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-dup-'));
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

  function seedProject() {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Dup Novel' });
    const a1 = db.googleAccounts.create({
      label: 'A1',
      email: 'a1@test.com',
      displayName: 'A1',
      profileDirName: 'p-a1',
    });
    const a2 = db.googleAccounts.create({
      label: 'A2',
      email: 'a2@test.com',
      displayName: 'A2',
      profileDirName: 'p-a2',
    });
    return { db, project, a1, a2 };
  }

  it('same remote notebook_id: keeps one local row, deprecates others — no remote delete', () => {
    const { db, project, a1, a2 } = seedProject();
    const primary = db.notebooks.upsert({
      project_id: project.id,
      google_account_id: a1.id,
      notebook_name: '[Khepree] Dup',
      notebook_role: 'SINGLE',
      notebook_id: 'remote-same',
      resource_url: 'https://notebook.google.com/n/remote-same',
      status: 'ready',
      last_verified_at: '2026-09-01T00:00:00.000Z',
    });
    // Force second row via raw insert (upsert would merge same worker+role)
    const raw = db.getConnection();
    raw
      .prepare(
        `INSERT INTO notebook_resources (
          id, project_id, notebook_id, resource_url, status,
          google_account_id, notebook_name, notebook_role, created_at, updated_at
        ) VALUES (?, ?, 'remote-same', 'https://notebook.google.com/n/remote-same', 'ready',
          ?, '[Khepree] Dup', 'SINGLE', datetime('now'), datetime('now', '-1 day'))`,
      )
      .run('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', project.id, a2.id);

    const report = auditHistoricalNotebookBindingDuplicates(raw);
    expect(report.groupsFound).toBe(1);
    expect(report.autoRetainedPrimary).toBe(1);
    expect(report.locallyDeprecated).toBe(1);
    expect(report.needsUserResolution).toBe(0);

    const rows = db.notebooks.listByProject(project.id);
    const active = rows.filter((r) => !r.deprecated_at && r.notebook_id);
    expect(active).toHaveLength(1);
    expect(active[0]!.notebook_id).toBe('remote-same');
    // Both local rows still exist — remote id preserved on deprecated too
    expect(rows.every((r) => r.notebook_id === 'remote-same')).toBe(true);
    expect(rows.some((r) => r.deprecated_at)).toBe(true);
    expect(primary.id).toBeTruthy();
  });

  it('high-confidence primary: ready+url wins; secondary deprecated locally', () => {
    const { db, project, a1, a2 } = seedProject();
    const raw = db.getConnection();
    raw
      .prepare(
        `INSERT INTO notebook_resources (
          id, project_id, notebook_id, resource_url, status,
          google_account_id, notebook_name, notebook_role,
          last_verified_at, knowledge_version, created_at, updated_at
        ) VALUES
        ('11111111-1111-1111-1111-111111111111', ?, 'remote-good',
         'https://notebook.google.com/n/remote-good', 'ready', ?, '[Khepree] Dup', 'SINGLE',
         '2026-09-04T00:00:00.000Z', 3, datetime('now'), datetime('now')),
        ('22222222-2222-2222-2222-222222222222', ?, 'remote-bad',
         NULL, 'error', ?, '[Khepree] Dup', 'SINGLE',
         NULL, 0, datetime('now'), datetime('now', '-2 day'))`,
      )
      .run(project.id, a1.id, project.id, a2.id);

    const report = auditHistoricalNotebookBindingDuplicates(raw);
    expect(report.autoRetainedPrimary).toBe(1);
    expect(report.locallyDeprecated).toBe(1);

    const good = db.notebooks.getById('11111111-1111-1111-1111-111111111111');
    const bad = db.notebooks.getById('22222222-2222-2222-2222-222222222222');
    expect(good?.deprecated_at).toBeNull();
    expect(bad?.deprecated_at).toBeTruthy();
    expect(bad?.notebook_id).toBe('remote-bad'); // remote id kept locally
  });

  it('ambiguous distinct remotes: needs user resolution — neither deprecated, attention opened', () => {
    const { db, project, a1, a2 } = seedProject();
    const raw = db.getConnection();
    raw
      .prepare(
        `INSERT INTO notebook_resources (
          id, project_id, notebook_id, resource_url, status,
          google_account_id, notebook_name, notebook_role,
          last_verified_at, knowledge_version, created_at, updated_at
        ) VALUES
        ('33333333-3333-3333-3333-333333333333', ?, 'remote-a',
         'https://notebook.google.com/n/remote-a', 'ready', ?, '[Khepree] Dup', 'SINGLE',
         '2026-09-04T00:00:00.000Z', 2, datetime('now'), datetime('now')),
        ('44444444-4444-4444-4444-444444444444', ?, 'remote-b',
         'https://notebook.google.com/n/remote-b', 'ready', ?, '[Khepree] Dup', 'SINGLE',
         '2026-09-04T00:00:00.000Z', 2, datetime('now'), datetime('now'))`,
      )
      .run(project.id, a1.id, project.id, a2.id);

    const report = auditHistoricalNotebookBindingDuplicates(raw);
    expect(report.needsUserResolution).toBe(1);
    expect(report.locallyDeprecated).toBe(0);

    const a = db.notebooks.getById('33333333-3333-3333-3333-333333333333');
    const b = db.notebooks.getById('44444444-4444-4444-4444-444444444444');
    expect(a?.deprecated_at).toBeNull();
    expect(b?.deprecated_at).toBeNull();
    expect(a?.last_error).toContain('duplicate_binding_needs_user_choice');

    const inbox = raw
      .prepare(
        `SELECT * FROM attention_inbox_items
         WHERE project_id = ? AND cause_code = 'NOTEBOOK_BINDING_DUPLICATE'`,
      )
      .all(project.id) as { title_vi: string; tech_detail: string }[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.title_vi).toContain('Notebook');
    expect(inbox[0]!.tech_detail).toContain('NOT deleted');
  });

  it('migration 057 run is idempotent and never removes notebook_id', () => {
    const { db, project, a1, a2 } = seedProject();
    const raw = db.getConnection();
    raw
      .prepare(
        `INSERT INTO notebook_resources (
          id, project_id, notebook_id, resource_url, status,
          google_account_id, notebook_name, notebook_role, created_at, updated_at
        ) VALUES
        ('55555555-5555-5555-5555-555555555555', ?, 'r1',
         'https://notebook.google.com/n/r1', 'ready', ?, 'N', 'SINGLE', datetime('now'), datetime('now')),
        ('66666666-6666-6666-6666-666666666666', ?, 'r1',
         'https://notebook.google.com/n/r1', 'pending', ?, 'N', 'SINGLE', datetime('now'), datetime('now','-1 day'))`,
      )
      .run(project.id, a1.id, project.id, a2.id);

    runMigration057NotebookBindingDuplicateAudit(raw);
    runMigration057NotebookBindingDuplicateAudit(raw);

    const rows = db.notebooks.listByProject(project.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.notebook_id === 'r1')).toBe(true);
    expect(rows.filter((r) => r.deprecated_at).length).toBe(1);
  });
});
