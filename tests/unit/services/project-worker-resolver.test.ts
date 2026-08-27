import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import { resolveProjectWorker } from '../../../src/main/services/project-worker-resolver';

describe('ProjectWorkerResolver', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountA: string;
  let accountB: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-pwr-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({ title: 'Worker Novel' }).id;

    accountA = db.googleAccounts.create({
      label: 'A',
      email: 'userA@gmail.com',
      displayName: 'A',
      profileDirName: 'profile-a',
      status: 'READY',
    }).id;
    accountB = db.googleAccounts.create({
      label: 'B',
      email: 'userB@gmail.com',
      displayName: 'B',
      profileDirName: 'profile-b',
      status: 'READY',
    }).id;

    for (const id of [accountA, accountB]) {
      const worker = db.workerStates.getByAccountId(id);
      if (worker) db.workerStates.setHealth(worker.id, 'READY');
    }
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('A READY + B READY + project mapped B → resolve returns B (not first READY)', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountB,
      notebook_name: '[NovelTrans] Worker Novel',
      notebook_role: 'TRANSLATION',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/b',
    });

    const resolved = resolveProjectWorker(db, {
      projectId,
      purpose: 'translation',
    });

    expect(resolved.accountId).toBe(accountB);
    expect(resolved.email).toBe('userB@gmail.com');
    expect(resolved.source).toBe('translation_notebook');
    expect(resolved.readyFallbackUsed).toBe(false);
    expect(resolved.hasProjectBinding).toBe(true);
  });

  it('does not READY-fallback when binding exists but preferred differs', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountB,
      notebook_name: '[NovelTrans] Worker Novel',
      notebook_role: 'TRANSLATION',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/b',
    });

    const resolved = resolveProjectWorker(db, {
      projectId,
      purpose: 'translation',
      preferredAccountId: accountA,
    });

    expect(resolved.accountId).toBe(accountB);
    expect(resolved.source).toBe('translation_notebook');
  });

  it('uses project assigned worker when no notebook', () => {
    db.driveSyncState.assignWorker(projectId, accountB);

    const resolved = resolveProjectWorker(db, {
      projectId,
      purpose: 'translation',
      preferredAccountId: accountA,
    });

    expect(resolved.accountId).toBe(accountB);
    expect(resolved.source).toBe('project_assigned');
  });

  it('READY fallback only when project has no binding', () => {
    const resolved = resolveProjectWorker(db, {
      projectId,
      purpose: 'translation',
    });

    expect(resolved.hasProjectBinding).toBe(false);
    expect(resolved.source).toBe('ready_fallback');
    expect(resolved.accountId).toBeTruthy();
    expect(resolved.readyFallbackUsed).toBe(true);
  });

  it('after Drive rebind prefers notebook on assigned account', () => {
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountA,
      notebook_name: '[NovelTrans] A',
      notebook_role: 'TRANSLATION',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/a',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountB,
      notebook_name: '[NovelTrans] B',
      notebook_role: 'TRANSLATION',
      status: 'ready',
      resource_url: 'https://notebook.google.com/n/b',
    });
    db.driveSyncState.assignWorker(projectId, accountB);

    const resolved = resolveProjectWorker(db, {
      projectId,
      purpose: 'translation',
    });

    expect(resolved.accountId).toBe(accountB);
  });
});
