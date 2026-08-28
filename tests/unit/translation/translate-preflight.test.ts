import { describe, expect, it } from 'vitest';
import {
  evaluateTranslatePreflight,
  isJobTerminalState,
  evaluateJobWatchTick,
  isJobWatchTimedOut,
  jobWatchProgressKey,
} from '../../../src/renderer/utils/translate-preflight';

describe('evaluateTranslatePreflight', () => {
  const base = {
    hasProject: true,
    hasChapter: true,
    paragraphCount: 3,
    workers: [{ health: 'READY', accountId: 'acc-1' }],
    googleAccounts: [{ id: 'acc-1', status: 'READY' }],
    aiAccounts: [{ status: 'READY' }],
    notebookStatus: null as string | null,
    resolvedWorkerAccountId: 'acc-1' as string | null,
  };

  it('ok when Web API account READY', () => {
    const result = evaluateTranslatePreflight(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.webApiReady).toBe(true);
      expect(result.notebookReady).toBe(false);
    }
  });

  it('ok when only notebook ready', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      aiAccounts: [],
      notebookStatus: 'ready',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notebookReady).toBe(true);
  });

  it('fails no_paragraphs', () => {
    const result = evaluateTranslatePreflight({ ...base, paragraphCount: 0 });
    expect(result).toEqual({ ok: false, reason: 'no_paragraphs' });
  });

  it('fails no_worker', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      workers: [],
      googleAccounts: [{ id: 'acc-1', status: 'LOGIN_REQUIRED' }],
    });
    expect(result).toEqual({ ok: false, reason: 'no_worker' });
  });

  it('ok when google account BUSY (Notebook browser still open)', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      workers: [{ health: 'BUSY', accountId: 'acc-1' }],
      googleAccounts: [{ id: 'acc-1', status: 'BUSY', workerEnabled: true }],
      aiAccounts: [],
      notebookStatus: 'ready',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workerAccountId).toBe('acc-1');
      expect(result.notebookReady).toBe(true);
    }
  });

  it('fails no_worker when workerEnabled false', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      workers: [],
      googleAccounts: [{ id: 'acc-1', status: 'READY', workerEnabled: false }],
      aiAccounts: [],
      notebookStatus: 'ready',
    });
    expect(result).toEqual({ ok: false, reason: 'no_worker' });
  });

  it('fails no_channel when no Web API and no notebook', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      aiAccounts: [{ status: 'LOGIN_REQUIRED' }],
      notebookStatus: 'pending',
    });
    expect(result).toEqual({ ok: false, reason: 'no_channel' });
  });

  it('uses resolvedWorkerAccountId — never first READY', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      workers: [
        { health: 'READY', accountId: 'acc-1' },
        { health: 'READY', accountId: 'acc-2' },
      ],
      googleAccounts: [
        { id: 'acc-1', status: 'READY' },
        { id: 'acc-2', status: 'READY' },
      ],
      resolvedWorkerAccountId: 'acc-2',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workerAccountId).toBe('acc-2');
  });

  it('fails no_worker when resolvedWorkerAccountId missing', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      resolvedWorkerAccountId: null,
    });
    expect(result).toEqual({ ok: false, reason: 'no_worker' });
  });

  it('fails no_worker when resolved id not usable', () => {
    const result = evaluateTranslatePreflight({
      ...base,
      resolvedWorkerAccountId: 'acc-other',
    });
    expect(result).toEqual({ ok: false, reason: 'no_worker' });
  });
});

describe('isJobTerminalState', () => {
  it('treats completed and failed as terminal', () => {
    expect(isJobTerminalState('COMPLETED')).toBe(true);
    expect(isJobTerminalState('FAILED')).toBe(true);
    expect(isJobTerminalState('NEEDS_ATTENTION')).toBe(true);
    expect(isJobTerminalState('QUEUED')).toBe(false);
  });
});

describe('job watch helpers', () => {
  it('classifies success / failure / pending', () => {
    expect(evaluateJobWatchTick('COMPLETED')).toBe('success');
    expect(evaluateJobWatchTick('ACCEPTED_WITH_WARNINGS')).toBe('success');
    expect(evaluateJobWatchTick('NEEDS_ATTENTION')).toBe('failure');
    expect(evaluateJobWatchTick('QUEUED')).toBe('pending');
    expect(evaluateJobWatchTick('SENDING')).toBe('pending');
  });

  it('times out only after max polls while still pending', () => {
    expect(isJobWatchTimedOut(149, 150, 'QUEUED')).toBe(false);
    expect(isJobWatchTimedOut(150, 150, 'QUEUED')).toBe(true);
    expect(isJobWatchTimedOut(150, 150, 'COMPLETED')).toBe(false);
    expect(isJobWatchTimedOut(150, 150, null)).toBe(true);
  });

  it('builds progress key from state + chunk fields', () => {
    expect(
      jobWatchProgressKey({
        state: 'WAITING_AI',
        progress: { phase: 'waiting_ai', chunkIndex: 2, chunkTotal: 4, paragraphsDone: 12 },
      }),
    ).toBe('WAITING_AI|waiting_ai|2|4|12||||');
    expect(
      jobWatchProgressKey({
        state: 'WAITING_AI',
        progress: {
          phase: 'waiting_ai',
          chunkIndex: 2,
          chunkTotal: 4,
          paragraphsDone: 12,
          providerType: 'GEMINI_WEB_API',
          packMode: 'local_context',
        },
      }),
    ).toBe('WAITING_AI|waiting_ai|2|4|12||GEMINI_WEB_API|local_context|');
    expect(
      jobWatchProgressKey({
        state: 'WAITING_AI',
        progress: { phase: 'waiting_ai', chunkIndex: 3, chunkTotal: 4, paragraphsDone: 24 },
      }),
    ).not.toBe(
      jobWatchProgressKey({
        state: 'WAITING_AI',
        progress: { phase: 'waiting_ai', chunkIndex: 2, chunkTotal: 4, paragraphsDone: 12 },
      }),
    );
  });
});
