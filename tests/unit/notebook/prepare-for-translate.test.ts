import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { NotebookBootstrapService } from '@main/notebook/notebook-bootstrap-service';

describe('prepareForTranslate', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-prep-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Prep Novel' }).id;
    db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '第一章。',
    });
  });

  afterEach(() => {
    db?.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('bootstraps when knowledge empty', async () => {
    expect(db.knowledgeFiles.listByProject(projectId)).toHaveLength(0);
    const service = new NotebookBootstrapService(db);
    const syncDrive = vi.fn(async () => undefined);
    const provision = vi.fn(async () => ({
      assisted: false,
      mapping: { status: 'ready' },
      message: 'ok',
    }));

    const result = await service.prepareForTranslate(
      projectId,
      { accountId: null },
      { syncDrive, provision },
    );

    expect(result.ready).toBe(true);
    expect(db.knowledgeFiles.listByProject(projectId).length).toBeGreaterThan(0);
    expect(db.knowledgeFiles.listByProject(projectId).some((f) => f.content_hash)).toBe(true);
    expect(provision).not.toHaveBeenCalled();
  });

  it('attempts provision when worker READY and mapping missing', async () => {
    const account = db.googleAccounts.create({
      label: 'Worker',
      email: 'worker@example.com',
      profileDirName: 'profile-prep',
      status: 'READY',
    });
    const worker = db.workerStates.getByAccountId(account.id);
    expect(worker).toBeTruthy();
    db.workerStates.setHealth(worker!.id, 'READY');

    const service = new NotebookBootstrapService(db);
    const provision = vi.fn(async () => ({
      assisted: true,
      mapping: { status: 'needs_assisted' },
      message: 'Need browser',
    }));

    const result = await service.prepareForTranslate(
      projectId,
      { accountId: account.id },
      {
        syncDrive: async () => undefined,
        provision,
      },
    );

    expect(provision).toHaveBeenCalledOnce();
    expect(result.needsAssisted).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.ready).toBe(true);
  });
});
