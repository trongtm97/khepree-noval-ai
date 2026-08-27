import type { JobDto } from '@shared/schemas/job';

const ACTIVE_JOB_STATES = new Set([
  'QUEUED',
  'PREPARING',
  'WAITING_WORKER',
  'SENDING',
  'WAITING_AI',
  'RUNNING',
  'PARSING',
  'QA',
  'REPAIRING',
  'PAUSED',
]);

const ATTENTION_JOB_STATES = new Set(['NEEDS_ATTENTION', 'FAILED']);

const COMPLETED_JOB_STATES = new Set(['COMPLETED', 'ACCEPTED_WITH_WARNINGS']);

export function isJobActive(state: string): boolean {
  return ACTIVE_JOB_STATES.has(state);
}

export function isJobAttention(state: string): boolean {
  return ATTENTION_JOB_STATES.has(state);
}

export function isJobCompleted(state: string): boolean {
  return COMPLETED_JOB_STATES.has(state);
}

export interface JobProgressMeasure {
  /** 0–100 when measurable; null → indeterminate. */
  percent: number | null;
  indeterminate: boolean;
  labelParts: string[];
}

/** Real job.progress only — never attemptCount heuristics. */
export function measureJobProgress(job: JobDto): JobProgressMeasure {
  if (job.state === 'COMPLETED' || job.state === 'ACCEPTED_WITH_WARNINGS') {
    return { percent: 100, indeterminate: false, labelParts: [] };
  }

  const progress = job.progress;
  const total = progress?.paragraphsTotal;
  const done = progress?.paragraphsDone;
  const chunkIndex = progress?.chunkIndex;
  const chunkTotal = progress?.chunkTotal;
  const labelParts: string[] = [];

  if (typeof chunkTotal === 'number' && chunkTotal > 1 && typeof chunkIndex === 'number') {
    labelParts.push(`${chunkIndex}/${chunkTotal}`);
  }
  if (typeof total === 'number' && total > 0 && typeof done === 'number') {
    labelParts.push(`${done}/${total}`);
  }
  if (progress?.phase) {
    labelParts.push(progress.phase);
  }

  if (typeof total === 'number' && total > 0 && typeof done === 'number') {
    return {
      percent: Math.min(99, Math.max(0, Math.round((done / total) * 100))),
      indeterminate: false,
      labelParts,
    };
  }

  if (
    typeof chunkTotal === 'number' &&
    chunkTotal > 0 &&
    typeof chunkIndex === 'number'
  ) {
    return {
      percent: Math.min(99, Math.max(0, Math.round((chunkIndex / chunkTotal) * 100))),
      indeterminate: false,
      labelParts,
    };
  }

  return { percent: null, indeterminate: true, labelParts };
}
