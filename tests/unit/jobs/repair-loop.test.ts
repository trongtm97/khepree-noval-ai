import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import {
  runRepairLoop,
  recoverCrashedAttempts,
} from '@main/jobs/repair-loop';
import type { RepairSender } from '@main/jobs/repair-loop';
import { DEFAULT_MAX_REPAIR_ATTEMPTS } from '@shared/constants/job';

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

function missingP2(): string {
  return [
    '<TRANSLATION>',
    `${P1} Đoạn một.`,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

describe('repair loop + crash recovery', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;
  let service: JobService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-repair-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Repair Novel' }).id;
    service = new JobService(db);
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('completes when initial response passes QA', async () => {
    const result = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: okResponse(),
        maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
      },
      async () =>
        Promise.reject(new Error('sendRepair should not be called')),
    );
    expect(result.finalState).toBe('COMPLETED');
    expect(result.repairRounds).toBe(0);
    expect(result.attempts.length).toBeGreaterThanOrEqual(1);
    expect(result.attempts[0]?.state).toBe('SUCCEEDED');
  });

  it('repairs MISSING_PARAGRAPH then completes (max 2)', async () => {
    let sends = 0;
    const sendRepair: RepairSender = (req) => {
      sends += 1;
      expect(req.reason).toBe('MISSING_PARAGRAPH');
      expect(req.plan?.targetParagraphIds).toEqual([P2]);
      expect(req.plan?.retranslate).toBe(true);
      return Promise.resolve({
        rawResponse: okResponse(),
        inputRef: `repair-send-${sends}`,
      });
    };

    const result = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        maxRepairAttempts: 2,
      },
      sendRepair,
    );

    expect(result.finalState).toBe('COMPLETED');
    expect(result.repairRounds).toBe(1);
    expect(sends).toBe(1);
    const reasons = result.attempts.map((a) => a.reason).filter(Boolean);
    expect(reasons).toContain('MISSING_PARAGRAPH');
    // History stores attempt number, reason, input ref, output, result
    const withOutput = result.attempts.find((a) => a.output);
    expect(withOutput?.output).toBeTruthy();
    expect(withOutput?.result).toBeTruthy();
  });

  it('stops at NEEDS_ATTENTION after max repair attempts (no infinite loop)', async () => {
    let sends = 0;
    const sendRepair: RepairSender = () => {
      sends += 1;
      return Promise.resolve({
        rawResponse: missingP2(),
        inputRef: `bad-${sends}`,
      });
    };

    const result = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        maxRepairAttempts: 2,
      },
      sendRepair,
    );

    expect(result.finalState).toBe('NEEDS_ATTENTION');
    expect(result.repairRounds).toBe(2);
    expect(sends).toBe(2);
    const job = service.get(result.jobId).job;
    expect(job.state).toBe('NEEDS_ATTENTION');
    expect(job.attentionActions).toEqual(
      expect.arrayContaining(['retry', 'skip', 'manual_fix', 'accept_with_warning']),
    );
  });

  it('invalid MEMORY_DELTA completes without repair when translations OK', async () => {
    const badDelta = [
      '<TRANSLATION>',
      `${P1} A.`,
      `${P2} B.`,
      '</TRANSLATION>',
      '<TERM_DELTA>[]</TERM_DELTA>',
      '<MEMORY_DELTA>{broken',
      '</MEMORY_DELTA>',
    ].join('\n');

    let sends = 0;
    const sendRepair: RepairSender = () => {
      sends += 1;
      return Promise.reject(new Error('should not repair deltas'));
    };

    const result = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: badDelta,
        maxRepairAttempts: 2,
      },
      sendRepair,
    );

    expect(result.finalState).toBe('COMPLETED');
    expect(sends).toBe(0);
    expect(result.parsed?.translations).toHaveLength(2);
  });

  it('attention Skip / Accept With Warning / Manual Fix', async () => {
    const result = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        maxRepairAttempts: 0,
      },
      () => Promise.reject(new Error('should not send')),
    );
    expect(result.finalState).toBe('NEEDS_ATTENTION');

    const skipped = await service.applyAttentionAction(result.jobId, 'skip');
    expect(skipped.job.state).toBe('SKIPPED');

    const job2 = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        maxRepairAttempts: 0,
      },
      () => Promise.reject(new Error('no')),
    );
    const accepted = await service.applyAttentionAction(
      job2.jobId,
      'accept_with_warning',
    );
    expect(accepted.job.state).toBe('ACCEPTED_WITH_WARNINGS');

    const job3 = await service.runFromRawResponse(
      {
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        maxRepairAttempts: 0,
      },
      () => Promise.reject(new Error('no')),
    );
    const manual = await service.applyAttentionAction(job3.jobId, 'manual_fix');
    expect(manual.job.pausedReason).toBe('MANUAL_FIX');
  });

  it('crash recovery marks RUNNING attempts as CRASHED', () => {
    const job = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch_repair',
      state: 'RUNNING',
      config: JSON.stringify({
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        maxRepairAttempts: 2,
      }),
    });
    db.jobs.startAttempt({
      job_id: job.id,
      attempt_number: 1,
      reason: 'MISSING_PARAGRAPH',
      input_ref: 'in-flight',
      state: 'RUNNING',
    });

    const crashed = recoverCrashedAttempts(db, job.id);
    expect(crashed).toBe(1);
    const attempts = db.jobs.listAttempts(job.id);
    expect(attempts[0]?.state).toBe('CRASHED');
    expect(attempts[0]?.completed_at).toBeTruthy();

    // recover() with still-RUNNING job marks NEEDS_ATTENTION when it finds/found crashes
    db.jobs.updateState(job.id, 'RUNNING');
    // Start another in-flight attempt to exercise recover path
    db.jobs.startAttempt({
      job_id: job.id,
      attempt_number: 2,
      state: 'RUNNING',
    });
    const recovered = service.recover(job.id);
    expect(recovered.crashed).toBe(1);
    expect(recovered.job.state).toBe('NEEDS_ATTENTION');
  });

  it('runRepairLoop recovers crashed attempts before continuing', async () => {
    const job = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch_repair',
      state: 'RUNNING',
      config: JSON.stringify({
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
      }),
    });
    db.jobs.startAttempt({
      job_id: job.id,
      attempt_number: 1,
      state: 'RUNNING',
      input_ref: 'stale',
    });

    const result = await runRepairLoop(
      {
        jobId: job.id,
        projectId,
        batchParagraphs: batch,
        sourceParagraphIds: [P1, P2],
        initialRawResponse: okResponse(),
        initialInputRef: 'fresh',
        maxRepairAttempts: 2,
        sendRepair: () => Promise.reject(new Error('unused')),
      },
      { db },
    );

    expect(result.finalState).toBe('COMPLETED');
    const attempts = db.jobs.listAttempts(job.id);
    expect(attempts.some((a) => a.state === 'CRASHED')).toBe(true);
    expect(attempts.some((a) => a.state === 'SUCCEEDED')).toBe(true);
  });
});
