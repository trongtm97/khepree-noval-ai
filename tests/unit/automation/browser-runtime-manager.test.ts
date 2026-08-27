import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserRuntimeManager,
  resetBrowserRuntimeManagerForTests,
} from '@main/automation/browser-runner/browser-runtime-manager';
import { profileLockManager } from '@main/automation/browser-runner/profile-lock';
import type { LaunchContextFn } from '@main/automation/browser-runner/playwright-worker-runtime';
import type { BrowserContext, Page } from 'playwright';
import { AutomationError } from '@main/automation/errors/automation-errors';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

function fakePage(url = 'https://notebook.google.com/n/p1'): Page {
  const listeners = new Map<string, Set<() => void>>();
  const page = {
    isClosed: () => false,
    url: () => url,
    goto: vi.fn((next: string) => {
      url = next;
    }),
    on: (event: string, fn: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(fn);
    },
    _crash: () => {
      for (const fn of listeners.get('crash') ?? []) fn();
    },
  };
  return page as unknown as Page;
}

function fakeContext(page: Page): BrowserContext {
  const listeners = new Map<string, Set<() => void>>();
  let closed = false;
  const context = {
    pages: () => (closed ? [] : [page]),
    close: vi.fn(() => {
      closed = true;
      return Promise.resolve();
    }),
    newPage: vi.fn(() => {
      const p = fakePage();
      return Promise.resolve(p);
    }),
    on: (event: string, fn: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(fn);
    },
    _closeEmit: () => {
      for (const fn of listeners.get('close') ?? []) fn();
    },
  };
  return context as unknown as BrowserContext;
}

describe('BrowserRuntimeManager', () => {
  let tempRoot: string;
  let events: { event: string; payload?: Record<string, unknown> }[];
  let launchCalls: number;
  let manager: BrowserRuntimeManager;
  let profileA: string;
  let profileB: string;

  beforeEach(() => {
    resetBrowserRuntimeManagerForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-runtime-'));
    profileA = path.join(tempRoot, 'acct-a');
    profileB = path.join(tempRoot, 'acct-b');
    fs.mkdirSync(profileA, { recursive: true });
    fs.mkdirSync(profileB, { recursive: true });
    events = [];
    launchCalls = 0;

    const launchFn: LaunchContextFn = () => {
      launchCalls += 1;
      const page = fakePage();
      const context = fakeContext(page);
      return Promise.resolve({
        context,
        resolved: {
          preference: 'AUTO',
          engine: 'PLAYWRIGHT_CHROMIUM',
          executablePath: null,
          playwrightVersion: '0.0.0-test',
          displayName: 'test',
        },
        headless: true,
        disableAutomationControlled: false,
        loginCompat: false,
      });
    };

    manager = new BrowserRuntimeManager({
      launchFn,
      disableIdleSweeper: true,
      idleTimeoutMs: 50,
      recycleEveryBatches: 100,
      log: (event, payload) => {
        events.push({ event, payload });
      },
    });
  });

  afterEach(async () => {
    await manager.shutdownAll();
    profileLockManager.recoverIfStale(profileA, Date.now() + 10_000_000);
    profileLockManager.recoverIfStale(profileB, Date.now() + 10_000_000);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    resetBrowserRuntimeManagerForTests();
  });

  it('50 fake batches on same account launch browser only once', async () => {
    for (let i = 0; i < 50; i++) {
      await manager.runExclusive(
        {
          accountId: 'account-a',
          profilePath: profileA,
          diagnosticsDir: path.join(tempRoot, 'diag-a'),
          headless: true,
        },
        async ({ prepareNotebook }) => {
          await prepareNotebook({
            projectId: 'project-1',
            notebookUrl: 'https://notebook.google.com/n/p1',
            openNotebook: () => Promise.resolve(),
            verifyReady: () => Promise.resolve(),
          });
        },
      );
    }
    expect(launchCalls).toBe(1);
    expect(manager.getLaunchCount('account-a')).toBe(1);
    expect(events.some((e) => e.event === 'BROWSER_RUNTIME_CREATED')).toBe(true);
    expect(events.some((e) => e.event === 'BROWSER_RUNTIME_REUSED')).toBe(true);
  });

  it('isolates account A and B (separate launches)', async () => {
    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'p1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: () => Promise.resolve(),
        });
      },
    );
    await manager.runExclusive(
      {
        accountId: 'account-b',
        profilePath: profileB,
        diagnosticsDir: path.join(tempRoot, 'diag-b'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'p1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: () => Promise.resolve(),
        });
      },
    );
    expect(launchCalls).toBe(2);
    expect(manager.getRuntime('account-a')).toBeTruthy();
    expect(manager.getRuntime('account-b')).toBeTruthy();
  });

  it('project switch navigates; same project only verifies', async () => {
    const opens: string[] = [];
    const verifies: string[] = [];

    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'project-1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: (_p, url) => {
            opens.push(url);
            return Promise.resolve();
          },
          verifyReady: () => {
            verifies.push('p1');
            return Promise.resolve();
          },
        });
      },
    );

    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'project-1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: (_p, url) => {
            opens.push(url);
            return Promise.resolve();
          },
          verifyReady: () => {
            verifies.push('p1');
            return Promise.resolve();
          },
        });
      },
    );

    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'project-2',
          notebookUrl: 'https://notebook.google.com/n/p2',
          openNotebook: (_p, url) => {
            opens.push(url);
            return Promise.resolve();
          },
          verifyReady: () => {
            verifies.push('p2');
            return Promise.resolve();
          },
        });
      },
    );

    expect(launchCalls).toBe(1);
    expect(opens).toEqual([
      'https://notebook.google.com/n/p1',
      'https://notebook.google.com/n/p2',
    ]);
    expect(verifies).toEqual(['p1']);
  });

  it('recovers when page crashes by opening a new page', async () => {
    let firstPage: Page | null = null;
    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        firstPage = await prepareNotebook({
          projectId: 'project-1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: () => Promise.resolve(),
        });
        (firstPage as unknown as { isClosed: () => boolean }).isClosed = () => true;
      },
    );

    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ runtime, prepareNotebook }) => {
        const page = await prepareNotebook({
          projectId: 'project-1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: () => Promise.resolve(),
        });
        expect(page).not.toBe(firstPage);
        const ctx = runtime.getContext();
        if (!ctx) throw new Error('expected runtime context');
        expect(Reflect.get(ctx, 'newPage')).toHaveBeenCalled();
      },
    );
  });

  it('serializes concurrent ops on same account', async () => {
    const order: string[] = [];
    const a = manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 40));
        order.push('a-end');
      },
    );
    const b = manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      () => {
        order.push('b-start');
        order.push('b-end');
        return Promise.resolve();
      },
    );
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
    expect(launchCalls).toBe(1);
  });

  it('marks NEEDS_ATTENTION on session expired', async () => {
    await expect(
      manager.runExclusive(
        {
          accountId: 'account-a',
          profilePath: profileA,
          diagnosticsDir: path.join(tempRoot, 'diag-a'),
        },
        () => {
          throw new AutomationError('SESSION_EXPIRED', 'session gone');
        },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });

    expect(manager.getRuntime('account-a')?.health).toBe('NEEDS_ATTENTION');
  });

  it('shutdown closes all runtimes cleanly', async () => {
    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'p1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: () => Promise.resolve(),
        });
      },
    );
    await manager.shutdownAll();
    expect(manager.getRuntime('account-a')).toBeUndefined();
    expect(profileLockManager.isLocked(profileA)).toBe(false);
    expect(events.some((e) => e.event === 'BROWSER_RUNTIME_CLOSED')).toBe(true);
  });

  it('refuses second launch on same profile while runtime open', async () => {
    await manager.runExclusive(
      {
        accountId: 'account-a',
        profilePath: profileA,
        diagnosticsDir: path.join(tempRoot, 'diag-a'),
      },
      async ({ prepareNotebook }) => {
        await prepareNotebook({
          projectId: 'p1',
          notebookUrl: 'https://notebook.google.com/n/p1',
          openNotebook: () => Promise.resolve(),
        });
      },
    );
    expect(profileLockManager.isHeldByRuntime(profileA, 'account-a')).toBe(true);

    await expect(
      manager.runExclusive(
        {
          accountId: 'account-other',
          profilePath: profileA,
          diagnosticsDir: path.join(tempRoot, 'diag-x'),
        },
        () => Promise.resolve('nope'),
      ),
    ).rejects.toThrow(/already in use/i);
  });
});
