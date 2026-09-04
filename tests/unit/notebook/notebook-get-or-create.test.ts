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

describe('HR10 getOrCreateNotebookBinding', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-goc-'));
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
    const project = db.projects.create({ title: 'GOC Novel' });
    const account = db.googleAccounts.create({
      label: 'G',
      email: 'g@test.com',
      displayName: 'G',
      profileDirName: 'profile-goc',
    });
    return { db, project, account };
  }

  function mockProvider(opts: {
    findByName?: (name: string) => { name: string; id: string | null; url: string } | null;
    ensure?: (name: string) => { name: string; id: string | null; url: string };
    openFail?: boolean;
  }): NotebookProvider {
    const ensure = vi.fn(
      opts.ensure ??
        ((name: string) => ({
          name,
          id: 'new-remote',
          url: 'https://notebook.google.com/n/new-remote',
        })),
    );
    return {
      findNotebookByName: async (name: string) =>
        opts.findByName ? opts.findByName(name) : null,
      ensureNotebook: ensure,
      openNotebook: async (name: string) => {
        if (opts.openFail) throw new Error('session expired');
        return { name, id: 'opened', url: 'https://notebook.google.com/n/opened' };
      },
      __ensure: ensure,
    } as unknown as NotebookProvider & { __ensure: ReturnType<typeof vi.fn> };
  }

  const page = {
    url: () => 'https://notebook.google.com/',
    goto: async () => undefined,
  } as unknown as import('playwright').Page;

  it('getNotebookForStory returns null when unbound; never creates', () => {
    const { project } = seed();
    expect(getNotebookBindingService().getNotebookForStory(project.id)).toBeNull();
  });

  it('reuses existing binding and does not call ensureNotebook', async () => {
    const { project, account } = seed();
    const svc = getNotebookBindingService();
    svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      notebookId: 'bound-1',
      notebookUrl: 'https://notebook.google.com/n/bound-1',
      status: 'ready',
    });

    const provider = mockProvider({
      findByName: (name) => ({
        name,
        id: 'bound-1',
        url: 'https://notebook.google.com/n/bound-1',
      }),
    });

    const result = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('reused');
    expect(result.created).toBe(false);
    expect(result.binding.notebookId).toBe('bound-1');
    expect(
      (provider as unknown as { __ensure: ReturnType<typeof vi.fn> }).__ensure,
    ).not.toHaveBeenCalled();
    expect(svc.getNotebookForStory(project.id)?.notebookId).toBe('bound-1');
  });

  it('marks needs_reconnect on access failure — does not create another project', async () => {
    const { db, project, account } = seed();
    const svc = getNotebookBindingService();
    svc.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      notebookId: 'bound-dead',
      notebookUrl: null,
      status: 'ready',
    });

    const provider = mockProvider({
      findByName: () => null,
    });

    const result = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('needs_reconnect');
    expect(result.created).toBe(false);
    expect(result.binding.notebookId).toBe('bound-dead');
    expect(result.binding.status).toBe('unavailable');
    expect(
      (provider as unknown as { __ensure: ReturnType<typeof vi.fn> }).__ensure,
    ).not.toHaveBeenCalled();
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
  });

  it('creates only when unbound and persists immediately', async () => {
    const { project, account } = seed();
    const svc = getNotebookBindingService();
    const provider = mockProvider({});

    const result = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('created');
    expect(result.created).toBe(true);
    expect(result.binding.notebookId).toBe('new-remote');
    expect(svc.getNotebookForStory(project.id)?.notebookId).toBe('new-remote');
    expect(svc.getNotebookForStory(project.id)?.notebookUrl).toContain('new-remote');
  });

  it('second call reuses — still one binding row', async () => {
    const { db, project, account } = seed();
    const svc = new NotebookBindingService(db);
    const createProvider = mockProvider({});
    await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      provider: createProvider,
      page,
    });

    const reuseProvider = mockProvider({
      findByName: (name) => ({
        name,
        id: 'new-remote',
        url: 'https://notebook.google.com/n/new-remote',
      }),
    });
    const second = await svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] GOC Novel',
      role: 'SINGLE',
      provider: reuseProvider,
      page,
    });

    expect(second.outcome).toBe('reused');
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
    expect(
      (reuseProvider as unknown as { __ensure: ReturnType<typeof vi.fn> }).__ensure,
    ).not.toHaveBeenCalled();
  });
});
