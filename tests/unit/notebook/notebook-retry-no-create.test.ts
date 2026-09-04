import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { NotebookBindingService } from '@main/services/notebook-binding-service';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';

/**
 * HARD REQUIREMENT 12 — retry must never create another NotebookLM project.
 * Covers: chapter/job/campaign/worker retry, reconnect, resume after restart.
 */
describe('HR12 retry never creates another notebook', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-retry-'));
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

  function seed() {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Retry Novel' });
    const account = db.googleAccounts.create({
      label: 'Retry',
      email: 'retry@test.com',
      displayName: 'Retry',
      profileDirName: 'profile-retry',
    });
    return { db, project, account };
  }

  function mockProvider(opts?: {
    ensure?: ReturnType<typeof vi.fn>;
    findFail?: boolean;
  }): NotebookProvider & { __ensure: ReturnType<typeof vi.fn> } {
    const ensure =
      opts?.ensure ??
      vi.fn(async (name: string) => ({
        name,
        id: 'should-not-create',
        url: 'https://notebook.google.com/n/should-not-create',
      }));
    return {
      findNotebookByName: async (name: string) => {
        if (opts?.findFail) return null;
        return {
          name,
          id: 'original-nb',
          url: 'https://notebook.google.com/n/original-nb',
        };
      },
      ensureNotebook: ensure,
      openNotebook: async (name: string) => ({
        name,
        id: 'original-nb',
        url: 'https://notebook.google.com/n/original-nb',
      }),
      __ensure: ensure,
    } as unknown as NotebookProvider & { __ensure: ReturnType<typeof vi.fn> };
  }

  const page = {
    url: () => 'https://notebook.google.com/',
    goto: async () => undefined,
  } as unknown as import('playwright').Page;

  function bindOriginal(
    svc: NotebookBindingService,
    projectId: string,
    accountId: string,
  ) {
    return svc.persistBinding({
      projectId,
      accountId,
      notebookName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      notebookId: 'original-nb',
      notebookUrl: 'https://notebook.google.com/n/original-nb',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T12:00:00.000Z',
    });
  }

  it('job/chapter retry (reuseNotebookBindingForRetry) reuses original — never ensureNotebook', async () => {
    const { project, account } = seed();
    const svc = getNotebookBindingService();
    bindOriginal(svc, project.id, account.id);

    const provider = mockProvider();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        svc.reuseNotebookBindingForRetry({
          projectId: project.id,
          accountId: account.id,
          preferredName: '[Khepree] Retry Novel',
          role: 'SINGLE',
          provider,
          page,
        }),
      ),
    );

    expect(provider.__ensure).not.toHaveBeenCalled();
    expect(results.every((r) => r.outcome === 'reused')).toBe(true);
    expect(results.every((r) => r.binding.notebookId === 'original-nb')).toBe(true);
    expect(results.every((r) => r.created === false)).toBe(true);
  });

  it('campaign-style retries all share the same original notebookId', async () => {
    const { db, project, account } = seed();
    const svc = new NotebookBindingService(db);
    bindOriginal(svc, project.id, account.id);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const provider = mockProvider();
      const result = await svc.reuseNotebookBindingForRetry({
        projectId: project.id,
        accountId: account.id,
        preferredName: '[Khepree] Retry Novel',
        role: 'SINGLE',
        provider,
        page,
      });
      ids.push(result.binding.notebookId!);
      expect(provider.__ensure).not.toHaveBeenCalled();
    }
    expect(new Set(ids)).toEqual(new Set(['original-nb']));
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
  });

  it('reconnect after access failure marks needs_reconnect — does not create', async () => {
    const { project, account } = seed();
    const svc = getNotebookBindingService();
    bindOriginal(svc, project.id, account.id);

    const provider = mockProvider({ findFail: true });
    // No URL so resolveOrCreateRemote cannot open by URL either.
    svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      notebookId: 'original-nb',
      notebookUrl: null,
      status: 'ready',
    });

    const result = await svc.reuseNotebookBindingForRetry({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('needs_reconnect');
    expect(result.created).toBe(false);
    expect(result.binding.notebookId).toBe('original-nb');
    expect(provider.__ensure).not.toHaveBeenCalled();
  });

  it('resume after application restart reuses persisted binding', async () => {
    const { project, account } = seed();
    getNotebookBindingService().persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      notebookId: 'original-nb',
      notebookUrl: 'https://notebook.google.com/n/original-nb',
      status: 'ready',
    });

    // Simulate process restart: drop singleton, keep SQLite.
    resetNotebookBindingServiceForTests();
    const svc = getNotebookBindingService();
    expect(svc.getNotebookForStory(project.id)?.notebookId).toBe('original-nb');

    const provider = mockProvider();
    const result = await svc.reuseNotebookBindingForRetry({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('reused');
    expect(result.binding.notebookId).toBe('original-nb');
    expect(provider.__ensure).not.toHaveBeenCalled();
  });

  it('allowCreate:false with no binding refuses create (worker retry without bind)', async () => {
    const { project, account } = seed();
    const svc = getNotebookBindingService();
    const provider = mockProvider();

    const result = await svc.reuseNotebookBindingForRetry({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('needs_reconnect');
    expect(result.created).toBe(false);
    expect(result.binding.notebookId).toBeNull();
    expect(provider.__ensure).not.toHaveBeenCalled();
  });

  it('story-level remote binding blocks create even when worker row lost notebook_id', async () => {
    const { db, project, account } = seed();
    const svc = new NotebookBindingService(db);
    bindOriginal(svc, project.id, account.id);

    // Wipe notebook_id on worker row (corrupt / partial migrate) but keep story history via list.
    // Simulate: row still has id in DB from another account's copy — re-seed story remote on same project.
    const other = db.googleAccounts.create({
      label: 'Other',
      email: 'other@test.com',
      displayName: 'Other',
      profileDirName: 'profile-other',
    });
    // Clear current worker binding ids
    svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      notebookId: null,
      notebookUrl: null,
      status: 'error',
    });
    // Story still has remote via other worker row
    svc.persistBinding({
      projectId: project.id,
      accountId: other.id,
      notebookName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      notebookId: 'original-nb',
      notebookUrl: 'https://notebook.google.com/n/original-nb',
      status: 'ready',
    });

    const provider = mockProvider();
    const result = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Retry Novel',
      role: 'SINGLE',
      provider,
      page,
      allowCreate: true, // even first-time path must not duplicate story notebook
    });

    expect(result.created).toBe(false);
    expect(result.binding.notebookId).toBe('original-nb');
    expect(provider.__ensure).not.toHaveBeenCalled();
  });
});
