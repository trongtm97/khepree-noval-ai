import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  NotebookBindingService,
} from '@main/services/notebook-binding-service';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';
import { NotebookBindingSchema } from '@shared/schemas/notebook';

describe('HR9 durable NotebookBinding persistence', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-bind-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetNotebookBindingServiceForTests();
  });

  afterEach(() => {
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('persists projectId/notebookId/url/status/createdAt/lastVerifiedAt in notebook_resources', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Bind Novel' });
    const account = db.googleAccounts.create({
      label: 'W',
      email: 'w@test.com',
      displayName: 'W',
      profileDirName: 'profile-bind',
    });

    const svc = getNotebookBindingService();
    const row = svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Bind Novel',
      role: 'SINGLE',
      notebookId: 'nb-remote-durable-1',
      notebookUrl: 'https://notebook.google.com/notebook/nb-remote-durable-1',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T08:00:00.000Z',
    });

    const binding = svc.toBinding(row);
    expect(NotebookBindingSchema.parse(binding)).toMatchObject({
      projectId: project.id,
      accountId: account.id,
      notebookId: 'nb-remote-durable-1',
      notebookUrl: 'https://notebook.google.com/notebook/nb-remote-durable-1',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T08:00:00.000Z',
    });
    expect(binding.createdAt).toBeTruthy();
  });

  it('survives service reset (simulates app / queue restart)', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Restart Novel' });
    const account = db.googleAccounts.create({
      label: 'R',
      email: 'r@test.com',
      displayName: 'R',
      profileDirName: 'profile-restart',
    });

    getNotebookBindingService().persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Restart Novel',
      role: 'SINGLE',
      notebookId: 'nb-survive-1',
      notebookUrl: 'https://notebook.google.com/notebook/nb-survive-1',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T09:00:00.000Z',
    });

    resetNotebookBindingServiceForTests();
    const after = getNotebookBindingService().getBinding(
      project.id,
      account.id,
      'SINGLE',
    );
    expect(after).not.toBeNull();
    expect(after!.notebookId).toBe('nb-survive-1');
    expect(after!.notebookUrl).toContain('nb-survive-1');
    expect(after!.status).toBe('ready');

    const forStory = getNotebookBindingService().getBindingForStory(project.id);
    expect(forStory?.notebookId).toBe('nb-survive-1');
  });

  it('reuses same SQLite row on re-persist (no duplicate binding)', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Reuse Novel' });
    const account = db.googleAccounts.create({
      label: 'U',
      email: 'u@test.com',
      displayName: 'U',
      profileDirName: 'profile-reuse',
    });
    const svc = new NotebookBindingService(db);

    const first = svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Reuse',
      role: 'SINGLE',
      notebookId: 'nb-1',
      notebookUrl: 'https://notebook.google.com/n/nb-1',
      status: 'provisioning',
    });
    const second = svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Reuse',
      role: 'SINGLE',
      notebookId: 'nb-1',
      notebookUrl: 'https://notebook.google.com/n/nb-1',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T10:00:00.000Z',
    });

    expect(second.id).toBe(first.id);
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
    expect(svc.getBinding(project.id, account.id, 'SINGLE')?.status).toBe('ready');
  });
});
