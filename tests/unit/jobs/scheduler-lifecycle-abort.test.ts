import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, createDatabaseManager } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
import { JobService } from '@main/services/job-service';
import { browserProfileManager } from '@main/automation/browser-runner/profile-manager';
import { profileLockManager } from '@main/automation/browser-runner/profile-lock';

/**
 * Regression: stop() must abort in-flight execute after force-requeue
 * so afterEach closing SQLite never surfaces unhandled "database connection is not open".
 */
describe('scheduler lifecycle abort on stop', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let service: JobService;
  let scheduler: AutomationScheduler | null = null;
  let projectId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-sched-abort-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Abort Novel' }).id;
    const account = db.googleAccounts.create({
      label: 'w',
      email: 'w@example.com',
      profileDirName: 'abort-profile',
      status: 'READY',
    });
    fs.mkdirSync(browserProfileManager.resolveProfilePath('abort-profile'), {
      recursive: true,
    });
    const worker = db.workerStates.getByAccountId(account.id);
    if (!worker) throw new Error('missing worker');
    db.workerStates.setHealth(worker.id, 'READY');
    service = new JobService(db);
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop({ waitMs: 500 });
      scheduler = null;
    }
    try {
      profileLockManager.recoverIfStale(
        browserProfileManager.resolveProfilePath('abort-profile'),
        Date.now() + 10_000_000,
      );
    } catch {
      /* ignore */
    }
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('release after stop does not write closed DB', async () => {
    let releaseGate: (() => void) | undefined;
    const errors: string[] = [];
    const onUnhandled = (reason: unknown) => {
      errors.push(reason instanceof Error ? reason.message : String(reason));
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      scheduler = new AutomationScheduler(db, {
        maxConcurrentWorkers: 1,
        tickMs: 40,
        sendInitial: async () => {
          await new Promise<void>((resolve) => {
            releaseGate = resolve;
          });
          return {
            rawResponse: '<TRANSLATION>\n[C000001:P000001] x\n</TRANSLATION>',
            inputRef: 'abort-test',
          };
        },
      });
      service.attachScheduler(scheduler);

      service.enqueueTranslate({
        projectId,
        chapterFrom: 1,
        chapterTo: 1,
        sourceParagraphIds: ['[C000001:P000001]'],
        batchParagraphs: [{ paragraphId: '[C000001:P000001]', sourceText: '一' }],
      });

      scheduler.start();
      const active = scheduler;
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (active.getInFlightCount() === 1) resolve();
          else if (Date.now() - start > 5000) reject(new Error('timeout'));
          else setTimeout(tick, 25);
        };
        tick();
      });

      await active.stop({ waitMs: 80 });
      scheduler = null;
      releaseGate?.();
      await new Promise((r) => setTimeout(r, 150));

      db.close();
      closeDatabase();
      await new Promise((r) => setTimeout(r, 100));

      expect(errors.filter((m) => /not open|closed/i.test(m))).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
