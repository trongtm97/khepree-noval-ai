import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { NotebookBindingService } from '@main/services/notebook-binding-service';
import { resetNotebookBindingServiceForTests } from '@main/services/notebook-binding-service-singleton';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';

describe('HR11 notebook binding concurrency', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-race-'));
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

  it('5 concurrent getOrCreate calls create exactly one NotebookLM project', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Race Novel' });
    const account = db.googleAccounts.create({
      label: 'Race',
      email: 'race@test.com',
      displayName: 'Race',
      profileDirName: 'profile-race',
    });

    let ensureCalls = 0;
    let createStarted = 0;
    let releaseCreate: (() => void) | null = null;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });

    const makeProvider = (): NotebookProvider => {
      const ensure = vi.fn(async (name: string) => {
        ensureCalls += 1;
        createStarted += 1;
        // Hold first create so other callers hit the lock while unbound.
        if (createStarted === 1) {
          await createGate;
        }
        return {
          name,
          id: 'remote-only-one',
          url: 'https://notebook.google.com/n/remote-only-one',
        };
      });
      return {
        findNotebookByName: async (name: string) => {
          const bound = db.notebooks.getByProjectWorkerRole(
            project.id,
            account.id,
            'SINGLE',
          );
          if (bound?.notebook_id) {
            return {
              name: bound.notebook_name ?? name,
              id: bound.notebook_id,
              url: bound.resource_url ?? 'https://notebook.google.com/n/remote-only-one',
            };
          }
          return null;
        },
        ensureNotebook: ensure,
        openNotebook: async (name: string) => ({
          name,
          id: 'opened',
          url: 'https://notebook.google.com/n/remote-only-one',
        }),
      } as unknown as NotebookProvider;
    };

    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    const svc = new NotebookBindingService(db);

    const starters = Array.from({ length: 5 }, () =>
      svc.getOrCreateNotebookBinding({
        projectId: project.id,
        accountId: account.id,
        preferredName: '[Khepree] Race Novel',
        role: 'SINGLE',
        provider: makeProvider(),
        page,
      }),
    );

    // Let all 5 enter; only first create holds the gate.
    await new Promise((r) => setTimeout(r, 30));
    expect(ensureCalls).toBe(1);
    releaseCreate!();

    const results = await Promise.all(starters);

    expect(ensureCalls).toBe(1);
    expect(results.filter((r) => r.outcome === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'reused')).toHaveLength(4);

    const ids = new Set(results.map((r) => r.binding.notebookId));
    expect(ids).toEqual(new Set(['remote-only-one']));

    const rows = db.notebooks.listByProject(project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.notebook_id).toBe('remote-only-one');
  });

  it('double-check after lock prevents create when another waiter already bound', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Double Check' });
    const account = db.googleAccounts.create({
      label: 'DC',
      email: 'dc@test.com',
      displayName: 'DC',
      profileDirName: 'profile-dc',
    });

    const svc = new NotebookBindingService(db);
    let ensureCalls = 0;

    const slowProvider = {
      findNotebookByName: async () => null,
      ensureNotebook: async (name: string) => {
        ensureCalls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return {
          name,
          id: 'dc-remote',
          url: 'https://notebook.google.com/n/dc-remote',
        };
      },
      openNotebook: async (name: string) => ({
        name,
        id: 'dc-remote',
        url: 'https://notebook.google.com/n/dc-remote',
      }),
    } as unknown as NotebookProvider;

    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    const first = svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] DC',
      role: 'SINGLE',
      provider: slowProvider,
      page,
    });

    await new Promise((r) => setTimeout(r, 5));

    const secondProvider = {
      findNotebookByName: async (name: string) => {
        const bound = db.notebooks.getByProjectWorkerRole(
          project.id,
          account.id,
          'SINGLE',
        );
        if (!bound?.notebook_id) return null;
        return {
          name: bound.notebook_name ?? name,
          id: bound.notebook_id,
          url: bound.resource_url!,
        };
      },
      ensureNotebook: async () => {
        ensureCalls += 1;
        throw new Error('must not create on second waiter');
      },
      openNotebook: async (name: string) => ({
        name,
        id: 'dc-remote',
        url: 'https://notebook.google.com/n/dc-remote',
      }),
    } as unknown as NotebookProvider;

    const second = svc.getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] DC',
      role: 'SINGLE',
      provider: secondProvider,
      page,
    });

    const [a, b] = await Promise.all([first, second]);
    expect(ensureCalls).toBe(1);
    expect(a.binding.notebookId).toBe('dc-remote');
    expect(b.binding.notebookId).toBe('dc-remote');
    expect(a.outcome === 'created' || b.outcome === 'created').toBe(true);
    expect(a.outcome === 'reused' || b.outcome === 'reused').toBe(true);
  });
});
