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
  it('reads initial SLIM notebook channel from progress', () => {
    const channel = readRepairChannelFromProgress(
      JSON.stringify({
        providerType: 'PLAYWRIGHT_GEMINI',
        accountId: 'acc-1',
        notebookId: 'nb-translation-a',
        threadRef: 'thread-x',
        packMode: 'slim',
        localKnowledgeVersion: 47,
      }),
    );
    expect(channel).toEqual({
      providerType: 'PLAYWRIGHT_GEMINI',
      accountId: 'acc-1',
      notebookId: 'nb-translation-a',
      threadRef: 'thread-x',
      packMode: 'slim',
      knowledgeVersion: 47,
    });
  });

  it('SLIM wrap keeps Notebook framing + locked + hot; no full-source dump', () => {
    const prompt = wrapRepairPromptWithChannelContext({
      repairBody: 'Translate ONLY [C000001:P000002] 玄星玉。',
      packMode: 'slim',
      notebookId: 'nb-a',
      lockedTerms: [{ source: '王林', preferred: 'Vương Lâm' }],
      hotMemoryText: '## Hot Memory\n- 新词 → từ mới',
    });
    expect(prompt).toContain('Translation Notebook');
    expect(prompt).toContain('nb-a');
    expect(prompt).toContain('王林 → Vương Lâm');
    expect(prompt).toContain('新词 → từ mới');
    expect(prompt).toContain('Translate ONLY');
    expect(prompt).toContain('Do NOT switch to Research Notebook');
    expect(prompt).toContain('Do NOT open a generic Gemini chat');
  });

  it('WebAPI FAT wrap adds local memory and denies Notebook', () => {
    const prompt = wrapRepairPromptWithChannelContext({
      repairBody: 'Continue from P000010',
      packMode: 'fat',
      webApiFat: true,
      fatSections: {
        criticalRules: '## Critical Rules\n- keep tone',
        hotMemoryDelta: '## Hot Memory\nstory: cliff',
        activeProjectTerms: '## Active Project Terms\n玄星玉 → Huyền Tinh Ngọc',
      },
    });
    expect(prompt).toContain('GEMINI_WEB_API');
    expect(prompt).toContain('Notebook knowledge is NOT available');
    expect(prompt).toContain('玄星玉 → Huyền Tinh Ngọc');
    expect(prompt).toContain('Continue from P000010');
    expect(prompt).not.toContain('Playwright Translation Notebook');
  });
});

describe('repair loop inherits channel → same notebook', () => {
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
        packMode: 'slim',
        localKnowledgeVersion: 12,
        phase: 'waiting_ai',
      }),
    );
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('MISSING_PARAGRAPH repair receives same notebook/channel as initial SLIM', async () => {
    const sendRepair: RepairSender = (req) => {
      expect(req.channel?.notebookId).toBe('nb-translation-a');
      expect(req.channel?.accountId).toBe(accountId);
      expect(req.channel?.threadRef).toBe('thread-x');
      expect(req.channel?.packMode).toBe('slim');
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
    expect(repairAttempt?.packMode).toBe('slim');
    expect(repairAttempt?.threadRef).toBe('thread-x');
    expect(repairAttempt?.accountId).toBe(accountId);
    expect(repairAttempt?.knowledgeVersion).toBe(12);
  });

  it('WebAPI failover channel stored as FAT without notebook', async () => {
    const sendRepair: RepairSender = (req) => Promise.resolve({
      rawResponse: okResponse(),
      inputRef: 'corr:webapi',
      channel: {
        providerType: 'GEMINI_WEB_API',
        accountId: req.channel?.accountId ?? null,
        notebookId: null,
        threadRef: null,
        packMode: 'fat',
        knowledgeVersion: req.channel?.knowledgeVersion ?? null,
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
    expect(repairAttempt?.packMode).toBe('fat');
    expect(repairAttempt?.notebookId).toBeNull();
  });
});

describe('channel snapshot', () => {
  it('continuation-style channel snapshot serializes for attempts', () => {
    const snap = channelSnapshotForAttempt({
      providerType: 'PLAYWRIGHT_GEMINI',
      accountId: 'acc-1',
      notebookId: 'nb-a',
      threadRef: 'thr',
      packMode: 'hybrid',
      knowledgeVersion: 3,
    });
    expect(snap.packMode).toBe('hybrid');
    expect(snap.threadRef).toBe('thr');
  });
});
