import { describe, expect, it } from 'vitest';
import type { JobDto } from '../../../src/shared/schemas/job';
import {
  countPausedJobs,
  countWaitingJobs,
  friendlyChannel,
  isPausedJobState,
  isRunningJobState,
  isWaitingState,
  selectRunningJobs,
} from '../../../src/renderer/features/jobs/jobs-utils';

function job(partial: Partial<JobDto> & Pick<JobDto, 'state'>): JobDto {
  return {
    id: 'j1',
    projectId: 'p1',
    type: 'translate',
    priority: 100,
    chapterFrom: 1,
    chapterTo: 1,
    workerMode: 'POOL',
    pinnedAccountId: null,
    attemptCount: 0,
    error: null,
    pausedReason: null,
    maxRepairAttempts: 2,
    repairRound: 0,
    lastQa: null,
    lastParsed: null,
    attentionActions: [],
    progress: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    workerId: null,
    ...partial,
  };
}

describe('jobs-utils counts', () => {
  it('splits waiting vs paused', () => {
    const jobs = [
      job({ id: '1', state: 'QUEUED' }),
      job({ id: '2', state: 'WAITING_WORKER' }),
      job({ id: '3', state: 'PAUSED' }),
      job({ id: '4', state: 'RUNNING' }),
    ];
    expect(countWaitingJobs(jobs)).toBe(2);
    expect(countPausedJobs(jobs)).toBe(1);
    expect(isWaitingState('QUEUED')).toBe(true);
    expect(isPausedJobState('PAUSED')).toBe(true);
  });

  it('selects running jobs excluding queue states', () => {
    const jobs = [
      job({ id: '1', state: 'RUNNING' }),
      job({ id: '2', state: 'QUEUED' }),
      job({ id: '3', state: 'PAUSED' }),
    ];
    expect(selectRunningJobs(jobs).map((j) => j.id)).toEqual(['1']);
    expect(isRunningJobState('RUNNING')).toBe(true);
    expect(isRunningJobState('QUEUED')).toBe(false);
  });
});

describe('friendlyChannel', () => {
  it('labels local Gemini without Notebook', () => {
    const label = friendlyChannel(
      job({
        state: 'RUNNING',
        progress: {
          providerType: 'GEMINI_WEB_API',
          packMode: 'local_context',
        },
      }),
    );
    expect(label).toBe('Gemini');
  });

  it('labels notebook-assisted jobs as Notebook', () => {
    const label = friendlyChannel(
      job({
        state: 'RUNNING',
        progress: {
          providerType: 'PLAYWRIGHT_GEMINI',
          packMode: 'notebook_assisted',
          notebookId: 'nb-1',
        },
      }),
    );
    expect(label).toBe('Notebook');
  });
});
