import { describe, expect, it } from 'vitest';
import {
  channelSnapshotForAttempt,
  readRepairChannelFromProgress,
  wrapRepairPromptWithChannelContext,
} from '@main/jobs/repair-channel-context';
import { runRepairLoop, type RepairSender } from '@main/jobs/repair-loop';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { DatabaseManager } from '@main/db/database-manager';

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';

const LOCAL_SNAPSHOT = [
  '## Critical Rules',
  '- Keep tone consistent.',
  '## Locked Terms',
  '- 王林 → Vương Lâm [LOCKED]',
].join('\n');

function okResponse(): string {
  return [
    '<TRANSLATION>',
    `${P1} Một.`,
    `${P2} Hai.`,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

function missingP2(): string {
  return [
    '<TRANSLATION>',
    `${P1} Một.`,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

describe('repair channel context helpers', () => {
  it('reads channel from progress; legacy slim → local_context', () => {
    const channel = readRepairChannelFromProgress(
      JSON.stringify({
        providerType: 'PLAYWRIGHT_GEMINI',
        accountId: 'acc-1',
        notebookId: 'nb-translation-a',
        threadRef: 'thread-x',
        packMode: 'slim',
        localKnowledgeVersion: 47,
        localContextSnapshot: LOCAL_SNAPSHOT,
      }),
    );
    expect(channel).toEqual({
      providerType: 'PLAYWRIGHT_GEMINI',
      accountId: 'acc-1',
      notebookId: 'nb-translation-a',
      threadRef: 'thread-x',
      packMode: 'local_context',
      knowledgeVersion: 47,
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
  });

  it('wrap uses frozen local context snapshot + repair body', () => {
    const prompt = wrapRepairPromptWithChannelContext({
      repairBody: 'Translate ONLY [C000001:P000002] 玄星玉。',
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
    expect(prompt).toContain('Critical Rules');
    expect(prompt).toContain('王林 → Vương Lâm');
    expect(prompt).toContain('Translate ONLY');
    expect(prompt).toContain('## Repair task');
    expect(prompt).not.toContain('Translation Notebook');
  });

  it('continuation wrap preserves snapshot', () => {
    const prompt = wrapRepairPromptWithChannelContext({
      repairBody: 'Continue from P000010',
      localContextSnapshot: LOCAL_SNAPSHOT,
      operationType: 'CONTINUATION',
    });
    expect(prompt).toContain('Continue from P000010');
    expect(prompt).toContain('## Continuation task');
    expect(prompt).toContain('Critical Rules');
  });
});

describe('repair loop inherits channel → same local context', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;
  let jobId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-repair-ch-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({ title: 'Repair Channel Novel' }).id;
    accountId = db.googleAccounts.create({
      label: 'Repair Worker',
      email: 'repair-ch@test.com',
      displayName: 'Repair',
      profileDirName: 'profile-repair-ch',
      status: 'READY',
    }).id;
    const job = db.jobs.create({
      project_id: projectId,
      type: 'TRANSLATE_BATCH',
      state: 'RUNNING',
      chapter_from: 1,
      chapter_to: 1,
      pinned_account_id: accountId,
      config: JSON.stringify({
        batchParagraphs: [
          { paragraphId: P1, sourceText: '一' },
          { paragraphId: P2, sourceText: '二' },
        ],
        sourceParagraphIds: [P1, P2],
        maxRepairAttempts: 2,
      }),
    });
    jobId = job.id;
    db.jobs.updateProgress(
      jobId,
      JSON.stringify({
        providerType: 'PLAYWRIGHT_GEMINI',
        accountId,
        notebookId: 'nb-translation-a',
        threadRef: 'thread-x',
        packMode: 'local_context',
        localKnowledgeVersion: 12,
        localContextSnapshot: LOCAL_SNAPSHOT,
        phase: 'waiting_ai',
      }),
    );
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('MISSING_PARAGRAPH repair receives same channel + local_context', async () => {
    const sendRepair: RepairSender = (req) => {
      expect(req.channel?.notebookId).toBe('nb-translation-a');
      expect(req.channel?.accountId).toBe(accountId);
      expect(req.channel?.threadRef).toBe('thread-x');
      expect(req.channel?.packMode).toBe('local_context');
      expect(req.channel?.localContextSnapshot).toBe(LOCAL_SNAPSHOT);
      expect(req.channel?.providerType).toBe('PLAYWRIGHT_GEMINI');
      expect(req.channel?.knowledgeVersion).toBe(12);
      return Promise.resolve({
        rawResponse: okResponse(),
        inputRef: 'corr:repair-1',
        channel: req.channel ?? undefined,
      });
    };

    const loop = await runRepairLoop(
      {
        jobId,
        projectId,
        batchParagraphs: [
          { paragraphId: P1, sourceText: '一' },
          { paragraphId: P2, sourceText: '二' },
        ],
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        initialInputRef: 'corr:initial',
        maxRepairAttempts: 2,
        sendRepair,
      },
      { db },
    );

    expect(loop.finalState).toBe('COMPLETED');
    const repairAttempt = loop.attempts.find(
      (a) => a.reason === 'MISSING_PARAGRAPH' && a.result?.includes('repair_send'),
    );
    expect(repairAttempt?.notebookId).toBe('nb-translation-a');
    expect(repairAttempt?.providerType).toBe('PLAYWRIGHT_GEMINI');
    expect(repairAttempt?.packMode).toBe('local_context');
    expect(repairAttempt?.threadRef).toBe('thread-x');
    expect(repairAttempt?.accountId).toBe(accountId);
    expect(repairAttempt?.knowledgeVersion).toBe(12);
  });

  it('WebAPI failover keeps local_context (not separate fat pack)', async () => {
    const sendRepair: RepairSender = (req) => Promise.resolve({
      rawResponse: okResponse(),
      inputRef: 'corr:webapi',
      channel: {
        providerType: 'GEMINI_WEB_API',
        accountId: req.channel?.accountId ?? null,
        notebookId: req.channel?.notebookId ?? null,
        threadRef: req.channel?.threadRef ?? null,
        packMode: 'local_context',
        knowledgeVersion: req.channel?.knowledgeVersion ?? null,
        localContextSnapshot: LOCAL_SNAPSHOT,
      },
    });

    const loop = await runRepairLoop(
      {
        jobId,
        projectId,
        batchParagraphs: [
          { paragraphId: P1, sourceText: '一' },
          { paragraphId: P2, sourceText: '二' },
        ],
        sourceParagraphIds: [P1, P2],
        initialRawResponse: missingP2(),
        initialInputRef: 'corr:initial',
        maxRepairAttempts: 2,
        sendRepair,
      },
      { db },
    );

    expect(loop.finalState).toBe('COMPLETED');
    const repairAttempt = loop.attempts.find((a) =>
      a.result?.includes('repair_send'),
    );
    expect(repairAttempt?.providerType).toBe('GEMINI_WEB_API');
    expect(repairAttempt?.packMode).toBe('local_context');
  });
});

describe('channel snapshot', () => {
  it('serializes local context snapshot for attempts', () => {
    const snap = channelSnapshotForAttempt({
      providerType: 'PLAYWRIGHT_GEMINI',
      accountId: 'acc-1',
      notebookId: 'nb-a',
      threadRef: 'thr',
      packMode: 'local_context',
      knowledgeVersion: 3,
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
    expect(snap.packMode).toBe('local_context');
    expect(snap.localContextSnapshot).toBe(LOCAL_SNAPSHOT);
    expect(snap.threadRef).toBe('thr');
  });
});
