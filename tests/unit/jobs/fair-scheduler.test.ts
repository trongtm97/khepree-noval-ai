import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
import {
  orderProjectsWeightedFair,
  priorityToWeight,
  recordProjectServed,
  type WeightedFairState,
} from '@main/jobs/weighted-fair-rr';
import {
  claimsAllowedThisTick,
  resolveConcurrentNovelCap,
  SCHEDULER_QUEUE_BACKPRESSURE_DEPTH,
} from '@shared/constants/scheduler-fairness';
import { browserProfileManager } from '@main/automation/browser-runner/profile-manager';
import { profileLockManager } from '@main/automation/browser-runner/profile-lock';
import { CAMPAIGN_APP_META_LIMIT_KEYS } from '@shared/constants/translation-campaign';

const P1 = '[C000001:P000001]';
const batch = [{ paragraphId: P1, sourceText: '第一段足够长' }];

function okResponse(): string {
  return [
    '<TRANSLATION>',
    `${P1} Đoạn một.`,
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

async function waitFor(predicate: () => boolean, timeoutMs = 8_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await sleep(20);
  }
}

describe('weighted fair helpers', () => {
  it('maps priority to weight without starving low priority', () => {
    expect(priorityToWeight(1)).toBe(8);
    expect(priorityToWeight(8)).toBe(1);
    expect(priorityToWeight(99)).toBe(1);
  });

  it('gives high-priority projects more turns but still serves low', () => {
    const state: WeightedFairState = { served: new Map() };
    const projects = [
      { projectId: 'hi', minPriority: 1, waitSince: '2026-01-01T00:00:00.000Z' },
      { projectId: 'lo', minPriority: 8, waitSince: '2026-01-01T00:00:00.000Z' },
    ];
    const counts = { hi: 0, lo: 0 };
    for (let i = 0; i < 24; i += 1) {
      const order = orderProjectsWeightedFair(projects, state);
      const pick = order[0] as 'hi' | 'lo';
      counts[pick] += 1;
      recordProjectServed(state, pick);
    }
    expect(counts.hi).toBeGreaterThan(counts.lo);
    expect(counts.lo).toBeGreaterThan(0);
  });

  it('backpressure + novel cap helpers', () => {
    expect(resolveConcurrentNovelCap({ capabilityMax: 5, machineMax: 3, readyProfiles: 10 })).toBe(
      3,
    );
    expect(
      claimsAllowedThisTick({
        capacity: 5,
        queueDepth: SCHEDULER_QUEUE_BACKPRESSURE_DEPTH,
      }),
    ).toBe(1);
    expect(claimsAllowedThisTick({ capacity: 5, queueDepth: 10 })).toBe(5);
  });
});

describe('fair multi-novel scheduler (Prompt 06)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let service: JobService;
  let scheduler: AutomationScheduler | null = null;
  const accounts: { accountId: string; dir: string }[] = [];

  function seedAccount(label: string, dirName: string) {
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
    db.getConnection()
      .prepare(`UPDATE worker_states SET provider_type = ? WHERE id = ?`)
      .run('PLAYWRIGHT_GEMINI', worker.id);
    accounts.push({ accountId: account.id, dir: dirName });
    return account.id;
  }

  beforeEach(() => {
    accounts.length = 0;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-fair-'));
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

  it('serial within project: chapter order preserved', async () => {
    seedAccount('a', 'fair-a');
    const projectId = db.projects.create({ title: 'Serial' }).id;
    const started: number[] = [];
    const gates = new Map<string, () => void>();

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 30,
      sendInitial: async (ctx) => {
        started.push(ctx.job.chapter_from ?? 0);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });

    for (let i = 1; i <= 5; i += 1) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: i,
        chapterTo: i,
        workerMode: 'POOL',
        sourceParagraphIds: [P1],
        batchParagraphs: batch,
        priority: i,
      });
    }

    scheduler.start();
    await waitFor(() => started.length === 1);
    expect(started[0]).toBe(1);
    expect(scheduler.getInFlightCount()).toBe(1);

    for (let expectChapter = 1; expectChapter <= 5; expectChapter += 1) {
      await waitFor(() => started.length === expectChapter);
      expect(started[expectChapter - 1]).toBe(expectChapter);
      const running = db.jobs
        .listByProject(projectId)
        .find((j) => !['QUEUED', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(j.state));
      if (running) gates.get(running.id)?.();
      await waitFor(() => {
        if (!scheduler) return false;
        return (
          started.length > expectChapter ||
          (expectChapter === 5 && scheduler.getInFlightCount() === 0)
        );
      });
    }
  });

  it('fairness across many projects with fake provider', async () => {
    const accountIds = [
      seedAccount('a', 'fair-m-a'),
      seedAccount('b', 'fair-m-b'),
      seedAccount('c', 'fair-m-c'),
    ];
    const projectCount = 12;
    const projectIds: string[] = [];
    for (let i = 0; i < projectCount; i += 1) {
      projectIds.push(db.projects.create({ title: `N${i}` }).id);
    }

    const startedByProject = new Map<string, number>();
    const gates = new Map<string, () => void>();

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      capabilityMaxConcurrentNovels: 3,
      tickMs: 25,
      sendInitial: async (ctx) => {
        startedByProject.set(
          ctx.job.project_id,
          (startedByProject.get(ctx.job.project_id) ?? 0) + 1,
        );
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });

    for (let i = 0; i < projectCount; i += 1) {
      for (let ch = 1; ch <= 3; ch += 1) {
        service.enqueueTranslate({
          projectId: projectIds[i]!,
          chapterFrom: ch,
          chapterTo: ch,
          workerMode: 'POOL',
          sourceParagraphIds: [P1],
          batchParagraphs: batch,
          priority: i < 3 ? 1 : 8,
        });
      }
    }

    expect(db.jobs.countRunnableQueued()).toBe(projectCount * 3);

    scheduler.start();
    await waitFor(() => scheduler!.getInFlightCount() === 3);

    // Release waves until every project got at least one start
    for (let wave = 0; wave < 40 && startedByProject.size < projectCount; wave += 1) {
      for (const [jobId, release] of [...gates.entries()]) {
        release();
        gates.delete(jobId);
      }
      await sleep(80);
    }

    expect(startedByProject.size).toBe(projectCount);
    const hiStarts = projectIds
      .slice(0, 3)
      .reduce((s, id) => s + (startedByProject.get(id) ?? 0), 0);
    const loStarts = projectIds
      .slice(3)
      .reduce((s, id) => s + (startedByProject.get(id) ?? 0), 0);
    expect(hiStarts / 3).toBeGreaterThanOrEqual(loStarts / 9);
    void accountIds;
  });

  it('reconcile cancels duplicate queued jobs; enqueue is idempotent', () => {
    seedAccount('a', 'fair-dup');
    const projectId = db.projects.create({ title: 'Dup' }).id;
    const first = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1],
      batchParagraphs: batch,
    }).job;
    const second = service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1],
      batchParagraphs: batch,
    }).job;
    expect(second.id).toBe(first.id);

    // Force a duplicate row then reconcile
    db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 100,
      chapter_from: 1,
      chapter_to: 1,
      worker_mode: 'POOL',
      config: JSON.stringify({ batchParagraphs: batch, sourceParagraphIds: [P1] }),
    });
    const cancelled = service.reconcileDuplicates(projectId);
    expect(cancelled).toBe(1);
    const active = db.jobs
      .listByProject(projectId)
      .filter((j) => j.state === 'QUEUED' || j.state === 'WAITING_WORKER');
    expect(active).toHaveLength(1);
  });

  it('pause/resume project + usage_ledger on complete', async () => {
    seedAccount('a', 'fair-led');
    const projectId = db.projects.create({ title: 'Led' }).id;
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 1,
      tickMs: 30,
      sendInitial: async (ctx) => ({
        rawResponse: okResponse(),
        inputRef: ctx.job.id,
      }),
    });

    service.enqueueTranslate({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1],
      batchParagraphs: batch,
    });
    expect(service.pauseProject(projectId)).toBe(1);
    scheduler.start();
    await sleep(120);
    expect(scheduler.getInFlightCount()).toBe(0);
    expect(service.resumeProject(projectId)).toBe(1);
    await waitFor(() => db.usageLedger.countAll() >= 1);
    const rows = db.usageLedger.listByProject(projectId);
    expect(rows[0]?.char_count).toBeGreaterThan(0);
    expect(rows[0]?.outcome).toMatch(/COMPLETED|ACCEPTED/);
  });

  it('paginates job list instead of loading all', () => {
    const projectId = db.projects.create({ title: 'Page' }).id;
    for (let i = 1; i <= 30; i += 1) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: i,
        chapterTo: i,
        sourceParagraphIds: [P1],
        batchParagraphs: batch,
      });
    }
    const page = service.listPage({ projectId, limit: 10, offset: 0 });
    expect(page.jobs).toHaveLength(10);
    expect(page.total).toBe(30);
    const page2 = service.listPage({ projectId, limit: 10, offset: 10 });
    expect(page2.jobs).toHaveLength(10);
    expect(page2.jobs[0]?.id).not.toBe(page.jobs[0]?.id);
  });

  it('capability novel cap limits distinct projects in flight', async () => {
    seedAccount('a', 'fair-cap-a');
    seedAccount('b', 'fair-cap-b');
    seedAccount('c', 'fair-cap-c');
    db.appMeta.set(CAMPAIGN_APP_META_LIMIT_KEYS.maxConcurrentNovels, '1');

    const p1 = db.projects.create({ title: 'C1' }).id;
    const p2 = db.projects.create({ title: 'C2' }).id;
    const gates = new Map<string, () => void>();
    const started: string[] = [];

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 30,
      sendInitial: async (ctx) => {
        started.push(ctx.job.project_id);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });

    service.enqueueTranslate({
      projectId: p1,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1],
      batchParagraphs: batch,
    });
    service.enqueueTranslate({
      projectId: p2,
      chapterFrom: 1,
      chapterTo: 1,
      sourceParagraphIds: [P1],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => started.length === 1);
    await sleep(100);
    expect(started).toHaveLength(1);
    expect(scheduler.getInFlightCount()).toBe(1);
    for (const release of gates.values()) release();
  });

  it('scale enqueue 50 projects × 40 jobs without loading all into listPage default', () => {
    seedAccount('a', 'fair-scale');
    const ids: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      ids.push(db.projects.create({ title: `S${i}` }).id);
    }
    for (const projectId of ids) {
      for (let ch = 1; ch <= 40; ch += 1) {
        db.jobs.create({
          project_id: projectId,
          type: 'translate_batch',
          state: 'QUEUED',
          priority: ch,
          chapter_from: ch,
          chapter_to: ch,
          worker_mode: 'POOL',
          config: JSON.stringify({ batchParagraphs: batch, sourceParagraphIds: [P1] }),
        });
      }
    }
    expect(db.jobs.countRunnableQueued()).toBe(2000);
    const page = service.listPage({ limit: 50, offset: 0 });
    expect(page.jobs).toHaveLength(50);
    expect(page.total).toBe(2000);
    const weights = db.jobs.listQueuedProjectWeights();
    expect(weights).toHaveLength(50);
  });
});
