import { describe, expect, it } from 'vitest';
import { measureJobProgress } from '@shared/utils/job-progress';
import type { JobDto } from '@shared/schemas/job';

function baseJob(over: Partial<JobDto> = {}): JobDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    type: 'TRANSLATE',
    state: 'RUNNING',
    workerId: null,
    priority: 0,
    chapterFrom: 1,
    chapterTo: 3,
    workerMode: 'POOL',
    pinnedAccountId: null,
    attemptCount: 5,
    error: null,
    pausedReason: null,
    maxRepairAttempts: 2,
    repairRound: 0,
    lastQa: null,
    lastParsed: null,
    attentionActions: [],
    progress: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    ...over,
  };
}

describe('measureJobProgress', () => {
  it('does not use attemptCount heuristics', () => {
    const measure = measureJobProgress(baseJob({ attemptCount: 99, progress: null }));
    expect(measure.indeterminate).toBe(true);
    expect(measure.percent).toBeNull();
  });

  it('uses paragraphsDone/Total when present', () => {
    const measure = measureJobProgress(
      baseJob({
        progress: { paragraphsDone: 25, paragraphsTotal: 100, phase: 'waiting_ai' },
      }),
    );
    expect(measure.indeterminate).toBe(false);
    expect(measure.percent).toBe(25);
    expect(measure.labelParts).toContain('25/100');
    expect(measure.labelParts).toContain('waiting_ai');
  });

  it('falls back to chunkIndex/chunkTotal', () => {
    const measure = measureJobProgress(
      baseJob({
        progress: { chunkIndex: 2, chunkTotal: 4, phase: 'sending' },
      }),
    );
    expect(measure.indeterminate).toBe(false);
    expect(measure.percent).toBe(50);
  });
});
