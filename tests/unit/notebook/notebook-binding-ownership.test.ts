import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NotebookBindingService } from '@main/services/notebook-binding-service';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';

describe('NotebookBindingService (HR8 ownership)', () => {
  it('reuses bound notebook_id and never calls ensureNotebook', async () => {
    const svc = new NotebookBindingService();
    let ensureCalls = 0;
    const provider = {
      findNotebookByName: async (name: string) => ({
        name,
        id: 'remote-1',
        url: 'https://notebook.google.com/n/remote-1',
      }),
      ensureNotebook: async () => {
        ensureCalls += 1;
        throw new Error('must not create when bound');
      },
    } as unknown as NotebookProvider;
    const page = {
      url: () => 'https://notebook.google.com/n/remote-1',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    const result = await svc.resolveOrCreateRemote({
      provider,
      mapping: {
        notebook_id: 'bound-id',
        notebook_name: '[Khepree] Novel',
        resource_url: 'https://notebook.google.com/n/remote-1',
      },
      preferredName: '[Khepree] Novel',
      page,
    });

    expect(result.id).toBe('bound-id');
    expect(ensureCalls).toBe(0);
  });

  it('refuses create when bound id missing remotely and no URL', async () => {
    const svc = new NotebookBindingService();
    const provider = {
      findNotebookByName: async () => null,
      ensureNotebook: async () => {
        throw new Error('must not create');
      },
    } as unknown as NotebookProvider;
    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    await expect(
      svc.resolveOrCreateRemote({
        provider,
        mapping: {
          notebook_id: 'missing-bound',
          notebook_name: '[Khepree] Novel',
          resource_url: null,
        },
        preferredName: '[Khepree] Novel',
        page,
      }),
    ).rejects.toThrow(/refusing to create a duplicate/);
  });

  it('creates only when unbound via owned ensureNotebook', async () => {
    const svc = new NotebookBindingService();
    let ensureCalls = 0;
    const provider = {
      findNotebookByName: async () => null,
      ensureNotebook: async (name: string) => {
        ensureCalls += 1;
        return { name, id: 'new-id', url: 'https://notebook.google.com/n/new' };
      },
    } as unknown as NotebookProvider;
    const page = {
      url: () => 'https://notebook.google.com/n/new',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;

    const result = await svc.resolveOrCreateRemote({
      provider,
      mapping: {
        notebook_id: null,
        notebook_name: null,
        resource_url: null,
      },
      preferredName: '[Khepree] Novel',
      page,
    });

    expect(result.id).toBe('new-id');
    expect(ensureCalls).toBe(1);
  });
});

describe('HR8 — no production direct create callers', () => {
  const root = path.resolve(__dirname, '../../../src/main');
  const allowed = new Set([
    path.normalize(
      path.join(root, 'automation/providers/google/notebook-provider.ts'),
    ),
    path.normalize(path.join(root, 'services/notebook-binding-service.ts')),
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('src/main has no .ensureNotebook / .createNotebook outside owner + provider', () => {
    const offenders: string[] = [];
    // Match provider-style calls; allow private wrappers like this.ensureNotebook → provision.
    const createCall =
      /(?<!this)\.(?:ensureNotebook|createNotebook)\s*\(/;
    for (const file of walk(root)) {
      if (allowed.has(path.normalize(file))) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (createCall.test(text)) {
        offenders.push(path.relative(root, file).replace(/\\/g, '/'));
      }
    }
    expect(offenders, `unauthorized create callers: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });
});
