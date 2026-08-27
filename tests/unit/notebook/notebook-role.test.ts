import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import {
  getNotebookLayout,
  resolveResearchNotebook,
  resolveTranslationNotebook,
  listKnowledgeSyncMappings,
} from '../../../src/main/notebook/notebook-resolver';
import {
  formatNotebookNameForRole,
  inferNotebookLayout,
} from '../../../src/shared/constants/notebook-role';

describe('notebook role constants', () => {
  it('formats distinct names for research vs translation', () => {
    expect(formatNotebookNameForRole('Test Novel', 'RESEARCH')).toContain('Research');
    expect(formatNotebookNameForRole('Test Novel', 'TRANSLATION')).toContain('[NovelTrans]');
    expect(formatNotebookNameForRole('Test Novel', 'SINGLE')).toContain('[NovelTrans]');
  });

  it('infers SINGLE layout when legacy row exists', () => {
    expect(inferNotebookLayout(['TRANSLATION', 'RESEARCH'])).toBe('DUAL');
    expect(inferNotebookLayout(['SINGLE'])).toBe('SINGLE');
  });
});

describe('notebook role resolver', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-nb-role-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({ title: 'Role Novel' }).id;
    const account = db.googleAccounts.create({
      label: 'W',
      email: 'w@test.com',
      displayName: 'W',
      profileDirName: 'profile-w',
      status: 'READY',
    });
    accountId = account.id;
  });

  afterEach(() => {
    db?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('SINGLE row serves both research and translation', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Role Novel',
      notebook_role: 'SINGLE',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/single',
    });

    expect(getNotebookLayout(db, projectId, accountId)).toBe('SINGLE');
    const research = resolveResearchNotebook(db, projectId, accountId);
    const translation = resolveTranslationNotebook(db, projectId, accountId);
    expect(research?.id).toBe(translation?.id);
    expect(research?.notebook_role).toBe('SINGLE');
  });

  it('DUAL layout resolves research and translation separately', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans Research] Role Novel',
      notebook_role: 'RESEARCH',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/research',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Role Novel',
      notebook_role: 'TRANSLATION',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/translation',
    });

    expect(getNotebookLayout(db, projectId, accountId)).toBe('DUAL');
    const research = resolveResearchNotebook(db, projectId, accountId)!;
    const translation = resolveTranslationNotebook(db, projectId, accountId)!;
    expect(research.notebook_role).toBe('RESEARCH');
    expect(translation.notebook_role).toBe('TRANSLATION');
    expect(research.resource_url).not.toBe(translation.resource_url);
  });

  it('translation jobs must not pick research notebook in DUAL mode', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans Research] Role Novel',
      notebook_role: 'RESEARCH',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/research-only',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Role Novel',
      notebook_role: 'TRANSLATION',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/translate-only',
    });

    const picked = resolveTranslationNotebook(db, projectId, accountId);
    expect(picked?.resource_url).toContain('translate-only');
    expect(picked?.notebook_role).toBe('TRANSLATION');
  });

  it('knowledge sync targets translation/SINGLE only', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans Research] Role Novel',
      notebook_role: 'RESEARCH',
      status: 'ready',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Role Novel',
      notebook_role: 'TRANSLATION',
      status: 'ready',
    });

    const syncTargets = listKnowledgeSyncMappings(db, projectId);
    expect(syncTargets).toHaveLength(1);
    expect(syncTargets[0]!.notebook_role).toBe('TRANSLATION');
  });

  it('worker can hold both roles as separate rows', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans Research] Role Novel',
      notebook_role: 'RESEARCH',
      status: 'provisioning',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Role Novel',
      notebook_role: 'TRANSLATION',
      status: 'assisted_setup',
    });

    const rows = db.notebooks.listByProjectAndWorker(projectId, accountId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.notebook_role).sort()).toEqual(['RESEARCH', 'TRANSLATION']);
  });
});
