import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
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

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timeout');
    }
    await sleep(25);
  }
}

describe('AutomationScheduler (Phase 15)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let accountA: string;
  let accountB: string;
  let workerA: string;
  let workerB: string;
  let service: JobService;
  let scheduler: AutomationScheduler | null = null;

  function seedAccount(label: string, dirName: string): { accountId: string; workerId: string } {
    const account = db.googleAccounts.create({
      label,
      email: `${label}@example.com`,
      profileDirName: dirName,
      status: 'READY',
    });
    fs.mkdirSync(browserProfileManager.resolveProfilePath(dirName), { recursive: true });
    const worker = db.workerStates.getByAccountId(account.id);
    if (!worker) throw new Error('worker_states missing');
    db.workerStates.setHealth(worker.id, 'READY');
    return { accountId: account.id, workerId: worker.id };
  }

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-sched-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Scheduler Novel' }).id;
    const a = seedAccount('worker-a', 'profile-a');
    const b = seedAccount('worker-b', 'profile-b');
    accountA = a.accountId;
    accountB = b.accountId;
    workerA = a.workerId;
    workerB = b.workerId;
    service = new JobService(db);
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop({ waitMs: 2_000 });
      scheduler = null;
    }
    for (const dir of ['profile-a', 'profile-b']) {
      try {
        profileLockManager.forceClearStaleLock(
          browserProfileManager.resolveProfilePath(dir),
        );
      } catch {
        /* ignore */
      }
    }
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('runs two POOL workers in parallel up to maxConcurrent', async () => {
    const startedAccounts: string[] = [];
    const releaseGates = new Map<string, () => void>();

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 2,
      tickMs: 50,
      leaseMs: 30_000,
      sendInitial: async (ctx) => {
        startedAccounts.push(ctx.accountId);
        await new Promise<void>((resolve) => {
          releaseGates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: `init:${ctx.job.id}` };
      },
    });
    service.attachScheduler(scheduler);

    const { job: job1 } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      workerMode: 'POOL',
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
      priority: 10,
    });
    const { job: job2 } = service.enqueueTranslate({
      projectId,
      chapterFrom: 2,
      chapterTo: 2,
      workerMode: 'POOL',
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
      priority: 20,
    });

    scheduler.start();
    await waitFor(() => startedAccounts.length === 2);

    expect(new Set(startedAccounts).size).toBe(2);
    expect(scheduler.getInFlightCount()).toBe(2);

    // Same profile never double-locked
    const locks = [workerA, workerB].map((id) => db.workerStates.getById(id)?.health);
    expect(locks.filter((h) => h === 'BUSY').length).toBe(2);

    for (const jobId of [job1.id, job2.id]) {
      releaseGates.get(jobId)?.();
    }
    await waitFor(
      () =>
        db.jobs.getById(job1.id)?.state === 'COMPLETED' &&
        db.jobs.getById(job2.id)?.state === 'COMPLETED',
    );
  });

  it('PINNED mode only uses pinned worker', async () => {
    const used: string[] = [];
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 2,
      tickMs: 40,
      sendInitial: (ctx) => {
        used.push(ctx.accountId);
        return Promise.resolve({ rawResponse: okResponse(), inputRef: 'pinned' });
      },
    });

    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      workerMode: 'PINNED',
      pinnedAccountId: accountB,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    // Disable worker A so only B is READY — still pin to B
    db.workerStates.setHealth(workerA, 'DISABLED');

    scheduler.start();
    await waitFor(() => db.jobs.getById(job.id)?.state === 'COMPLETED');
    expect(used).toEqual([accountB]);
  });

  it('PINNED waits when pinned worker LIMITED (no spam retry)', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    db.workerStates.markLimited(workerA, until, 'QUOTA_LIMIT');

    let sends = 0;
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 2,
      tickMs: 40,
      sendInitial: () => {
        sends += 1;
        return Promise.resolve({ rawResponse: okResponse(), inputRef: 'x' });
      },
    });

    service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      workerMode: 'PINNED',
      pinnedAccountId: accountA,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await sleep(200);
    expect(sends).toBe(0);
    expect(db.jobs.listByProject(projectId)[0]?.state).toBe('QUEUED');
  });

  it('QUOTA_LIMIT marks worker LIMITED and requeues job', async () => {
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 1,
      tickMs: 40,
      quotaCooldownMs: 60_000,
      sendInitial: () => Promise.reject(new Error('QUOTA_LIMIT exceeded')),
    });

    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      workerMode: 'PINNED',
      pinnedAccountId: accountA,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => db.workerStates.getById(workerA)?.health === 'LIMITED');
    await waitFor(() => db.jobs.getById(job.id)?.state === 'QUEUED');
    expect(db.workerStates.getById(workerA)?.limited_until).toBeTruthy();
  });

  it('crash simulation: expired lease recovers to QUEUED', () => {
    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    // Simulate crash mid-flight: PREPARING + expired lease
    const past = new Date(Date.now() - 5_000).toISOString();
    db.getConnection()
      .prepare(
        `UPDATE jobs SET state = 'SENDING', lease_owner = 'dead-process',
         lease_expires_at = ?, worker_id = ?, started_at = ? WHERE id = ?`,
      )
      .run(past, workerA, past, job.id);

    const recovered = db.jobs.recoverExpiredLeases();
    expect(recovered).toBe(1);
    const row = db.jobs.getById(job.id);
    expect(row?.state).toBe('QUEUED');
    expect(row?.lease_owner).toBeNull();
  });

  it('pause all / resume all / cancel / retry / move', () => {
    const { job: j1 } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      priority: 50,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });
    const { job: j2 } = service.enqueueTranslate({
      projectId,
      chapterFrom: 2,
      chapterTo: 2,
      priority: 40,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    expect(service.pauseAll().affected).toBe(2);
    expect(db.jobs.getById(j1.id)?.state).toBe('PAUSED');
    expect(service.resumeAll().affected).toBe(2);
    expect(db.jobs.getById(j1.id)?.state).toBe('QUEUED');

    const moved = service.moveJob(j2.id, 5);
    expect(moved.priority).toBe(5);

    service.cancelJob(j1.id);
    expect(db.jobs.getById(j1.id)?.state).toBe('CANCELLED');
    const retried = service.retryFailed(j1.id);
    expect(retried.state).toBe('QUEUED');

    service.changeWorker(j2.id, 'PINNED', accountA);
    expect(db.jobs.getById(j2.id)?.worker_mode).toBe('PINNED');
    expect(db.jobs.getById(j2.id)?.pinned_account_id).toBe(accountA);
  });

  it('graceful shutdown requeues in-flight jobs', async () => {
    let releaseGate: (() => void) | undefined;
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 1,
      tickMs: 40,
      sendInitial: async (ctx) => {
        await new Promise<void>((resolve) => {
          releaseGate = resolve;
        });
        return { rawResponse: okResponse(), inputRef: `g:${ctx.job.id}` };
      },
    });

    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    const active = scheduler;
    await waitFor(() => active.getInFlightCount() === 1);

    // Stop without waiting for gate — requeues
    await active.stop({ waitMs: 100 });
    scheduler = null;
    releaseGate?.();

    const row = db.jobs.getById(job.id);
    expect(row?.state).toBe('QUEUED');
    expect(row?.lease_owner).toBeNull();
  });

  it('queue survives process restart (durable SQLite)', () => {
    const { job } = service.enqueueTranslate({
      projectId,
      chapterFrom: 3,
      chapterTo: 5,
      workerMode: 'POOL',
      priority: 7,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    const dataDir = resolveAppPaths(tempRoot).data;
    const backupsDir = resolveAppPaths(tempRoot).backups;
    db.close();
    closeDatabase();

    db = createDatabaseManager({ dataDir, backupsDir });
    service = new JobService(db);
    const restored = db.jobs.getById(job.id);
    expect(restored?.state).toBe('QUEUED');
    expect(restored?.priority).toBe(7);
    expect(restored?.chapter_from).toBe(3);
    expect(restored?.chapter_to).toBe(5);
    expect(restored?.worker_mode).toBe('POOL');
  });
});
