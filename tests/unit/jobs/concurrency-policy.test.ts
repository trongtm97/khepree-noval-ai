import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
import { WorkerPool } from '@main/jobs/worker-pool';
import {
  buildConcurrencySnapshot,
  canAdmitJob,
  loadConcurrencyPolicy,
  saveConcurrencyPolicy,
} from '@main/jobs/concurrency-policy';
import {
  DEFAULT_CONCURRENCY_POLICY,
  resolveGlobalMaxWorkers,
} from '@shared/constants/concurrency-policy';
import { profileLockManager } from '@main/automation/browser-runner/profile-lock';
import { browserProfileManager } from '@main/automation/browser-runner/profile-manager';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const batch = [
  { paragraphId: P1, sourceText: '第一段' },
  { paragraphId: P2, sourceText: '第二段' },
];

function okResponse(): string {
  return [
    '<TRANSLATION>',
    `${P1} Đoạn một.`,
    `${P2} Đoạn hai.`,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await sleep(25);
  }
}

describe('ConcurrencyPolicy', () => {
  it('AUTO = min(READY, autoCap)', () => {
    const policy = { ...DEFAULT_CONCURRENCY_POLICY, autoCap: 3 };
    expect(resolveGlobalMaxWorkers(policy, 10)).toBe(3);
    expect(resolveGlobalMaxWorkers(policy, 2)).toBe(2);
  });

  it('canAdmit blocks same project when allowSameProjectParallel=false', () => {
    const policy = DEFAULT_CONCURRENCY_POLICY;
    const snap = buildConcurrencySnapshot([
      {
        jobId: 'j1',
        projectId: 'p1',
        accountId: 'a1',
        providerKind: 'PLAYWRIGHT_GEMINI',
      },
    ]);
    expect(
      canAdmitJob(policy, snap, {
        projectId: 'p1',
        accountId: 'a2',
        providerKind: 'PLAYWRIGHT_GEMINI',
      }),
    ).toBe(false);
    expect(
      canAdmitJob(policy, snap, {
        projectId: 'p2',
        accountId: 'a2',
        providerKind: 'PLAYWRIGHT_GEMINI',
      }),
    ).toBe(true);
  });

  it('canAdmit blocks same project even when DB has allowSameProjectParallel=true', () => {
    const policy = {
      ...DEFAULT_CONCURRENCY_POLICY,
      allowSameProjectParallel: true,
      perProjectMax: 4,
    };
    const snap = buildConcurrencySnapshot([
      {
        jobId: 'j1',
        projectId: 'p1',
        accountId: 'a1',
        providerKind: 'PLAYWRIGHT_GEMINI',
      },
    ]);
    expect(
      canAdmitJob(policy, snap, {
        projectId: 'p1',
        accountId: 'a2',
        providerKind: 'PLAYWRIGHT_GEMINI',
      }),
    ).toBe(false);
  });

  it('canAdmit blocks second Playwright job on same account', () => {
    const policy = DEFAULT_CONCURRENCY_POLICY;
    const snap = buildConcurrencySnapshot([
      {
        jobId: 'j1',
        projectId: 'p1',
        accountId: 'acc-a',
        providerKind: 'PLAYWRIGHT_GEMINI',
      },
    ]);
    expect(
      canAdmitJob(policy, snap, {
        projectId: 'p2',
        accountId: 'acc-a',
        providerKind: 'PLAYWRIGHT_GEMINI',
      }),
    ).toBe(false);
  });
});

describe('multi-stream fair scheduler', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let service: JobService;
  let scheduler: AutomationScheduler | null = null;
  const accounts: { accountId: string; workerId: string; dir: string }[] = [];

  function seedAccount(label: string, dirName: string, lastActive?: string) {
    const account = db.googleAccounts.create({
      label,
      email: `${label}@example.com`,
      profileDirName: dirName,
      status: 'READY',
    });
    fs.mkdirSync(browserProfileManager.resolveProfilePath(dirName), { recursive: true });
    const worker = db.workerStates.getByAccountId(account.id);
    if (!worker) throw new Error('worker missing');
    db.workerStates.setHealth(worker.id, 'READY');
    if (lastActive) {
      db.getConnection()
        .prepare(`UPDATE worker_states SET last_active_at = ?, provider_type = ? WHERE id = ?`)
        .run(lastActive, 'PLAYWRIGHT_GEMINI', worker.id);
    } else {
      db.getConnection()
        .prepare(`UPDATE worker_states SET provider_type = ? WHERE id = ?`)
        .run('PLAYWRIGHT_GEMINI', worker.id);
    }
    const row = { accountId: account.id, workerId: worker.id, dir: dirName };
    accounts.push(row);
    return row;
  }

  beforeEach(() => {
    accounts.length = 0;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-conc-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    service = new JobService(db);
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop({ waitMs: 2_000 });
      scheduler = null;
    }
    for (const a of accounts) {
      try {
        profileLockManager.recoverIfStale(
          browserProfileManager.resolveProfilePath(a.dir),
          Date.now() + 10_000_000,
        );
      } catch {
        /* ignore */
      }
    }
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('3 accounts × 3 projects → 3 concurrent jobs', async () => {
    const a = seedAccount('a', 'p-a');
    const b = seedAccount('b', 'p-b');
    const c = seedAccount('c', 'p-c');
    const p1 = db.projects.create({ title: 'P1' }).id;
    const p2 = db.projects.create({ title: 'P2' }).id;
    const p3 = db.projects.create({ title: 'P3' }).id;

    // Pin each project to its account so mapping is deterministic.
    for (const [projectId, accountId] of [
      [p1, a.accountId],
      [p2, b.accountId],
      [p3, c.accountId],
    ] as const) {
      db.googleAccounts.assignProject(accountId, projectId);
    }

    const started: string[] = [];
    const gates = new Map<string, () => void>();

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: async (ctx) => {
        started.push(ctx.accountId);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });
    service.attachScheduler(scheduler);

    for (const [projectId, chapter] of [
      [p1, 1],
      [p2, 1],
      [p3, 1],
    ] as const) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: chapter,
        chapterTo: chapter,
        workerMode: 'PINNED',
        pinnedAccountId:
          projectId === p1 ? a.accountId : projectId === p2 ? b.accountId : c.accountId,
        sourceParagraphIds: [P1, P2],
        batchParagraphs: batch,
      });
    }

    scheduler.start();
    await waitFor(() => started.length === 3);
    expect(new Set(started).size).toBe(3);
    expect(scheduler.getInFlightCount()).toBe(3);

    for (const release of gates.values()) release();
    await waitFor(() => {
      if (!scheduler) throw new Error('scheduler missing');
      return scheduler.getInFlightCount() === 0;
    });
  });

  it('same project: only 1 job by default', async () => {
    seedAccount('a', 'p-a');
    seedAccount('b', 'p-b');
    const projectId = db.projects.create({ title: 'Big Novel' }).id;
    const started: string[] = [];
    const gates = new Map<string, () => void>();

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: async (ctx) => {
        started.push(ctx.job.id);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });

    for (let i = 1; i <= 3; i += 1) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: i,
        chapterTo: i,
        workerMode: 'POOL',
        sourceParagraphIds: [P1, P2],
        batchParagraphs: batch,
        priority: i,
      });
    }

    scheduler.start();
    await waitFor(() => started.length === 1);
    await sleep(150);
    expect(started.length).toBe(1);
    expect(scheduler.getInFlightCount()).toBe(1);

    const firstStarted = started[0];
    if (firstStarted) gates.get(firstStarted)?.();
    await waitFor(() => started.length === 2);
  });

  it('quota on account A: B/C continue', async () => {
    const a = seedAccount('a', 'p-a');
    const b = seedAccount('b', 'p-b');
    const c = seedAccount('c', 'p-c');
    const pA = db.projects.create({ title: 'A' }).id;
    const pB = db.projects.create({ title: 'B' }).id;
    const pC = db.projects.create({ title: 'C' }).id;

    const until = new Date(Date.now() + 60_000).toISOString();
    db.workerStates.markLimited(a.workerId, until, 'QUOTA_LIMIT');

    const startedAccounts: string[] = [];
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: (ctx) => {
        startedAccounts.push(ctx.accountId);
        return Promise.resolve({ rawResponse: okResponse(), inputRef: ctx.job.id });
      },
    });

    for (const [projectId, accountId] of [
      [pA, a.accountId],
      [pB, b.accountId],
      [pC, c.accountId],
    ] as const) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: 1,
        chapterTo: 1,
        workerMode: 'PINNED',
        pinnedAccountId: accountId,
        sourceParagraphIds: [P1, P2],
        batchParagraphs: batch,
      });
    }

    scheduler.start();
    await waitFor(() => startedAccounts.length === 2);
    expect(startedAccounts).not.toContain(a.accountId);
    expect(new Set(startedAccounts)).toEqual(new Set([b.accountId, c.accountId]));
    await waitFor(
      () =>
        db.jobs.listByProject(pB)[0]?.state === 'COMPLETED' &&
        db.jobs.listByProject(pC)[0]?.state === 'COMPLETED',
    );
    expect(db.jobs.listByProject(pA)[0]?.state).toBe('QUEUED');
  });

  it('fair worker pick prefers least-recently-used over first DB row', () => {
    const old = seedAccount('old', 'p-old', '2020-01-01T00:00:00.000Z');
    const fresh = seedAccount('fresh', 'p-fresh', '2026-01-01T00:00:00.000Z');
    // Lower priority number = higher priority; keep equal so LRU decides.
    db.getConnection()
      .prepare(`UPDATE worker_states SET priority = 10 WHERE id IN (?, ?)`)
      .run(old.workerId, fresh.workerId);

    const pool = new WorkerPool(db);
    const fair = pool.listAvailableFair();
    expect(fair[0]?.google_account_id).toBe(old.accountId);
    expect(fair.map((w) => w.google_account_id)).toContain(fresh.accountId);
  });

  it('persists concurrency settings', () => {
    saveConcurrencyPolicy(db, {
      globalMaxWorkers: 'AUTO',
      autoCap: 3,
      perProjectMax: 4,
      perProviderMax: 4,
      allowSameProjectParallel: true,
    });
    const loaded = loadConcurrencyPolicy(db);
    expect(loaded.globalMaxWorkers).toBe('AUTO');
    expect(loaded.autoCap).toBe(3);
    expect(loaded.perProviderMax).toBe(4);
    expect(loaded.perProjectMax).toBe(1);
    expect(loaded.allowSameProjectParallel).toBe(false);
  });
});
