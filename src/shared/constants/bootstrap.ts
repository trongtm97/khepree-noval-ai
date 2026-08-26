/** Bootstrap analysis lifecycle + defaults. */

export const BOOTSTRAP_STATUSES = [
  'NOT_STARTED',
  'PREPARING',
  'ANALYZING',
  'PROCESSING',
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED',
  'SKIPPED',
] as const;

export type BootstrapStatus = (typeof BOOTSTRAP_STATUSES)[number];

export const BOOTSTRAP_VERSION = 'v1';

export const BOOTSTRAP_MODES = ['SAFE', 'BALANCED', 'DEEP'] as const;
export type BootstrapMode = (typeof BOOTSTRAP_MODES)[number];

export const BOOTSTRAP_MODE_CHAPTER_COUNTS: Record<BootstrapMode, number> = {
  SAFE: 5,
  BALANCED: 10,
  DEEP: 20,
};

/** Soft char budget for bootstrap AI input (source chapters only). */
export const DEFAULT_BOOTSTRAP_CHARACTER_BUDGET = 80_000;

export const BOOTSTRAP_CHAPTER_COUNT_MIN = 1;
export const BOOTSTRAP_CHAPTER_COUNT_MAX = 20;
export const DEFAULT_BOOTSTRAP_CHAPTER_COUNT = 10;

export const BOOTSTRAP_EVENT_TYPES = [
  'BOOTSTRAP_STARTED',
  'BOOTSTRAP_LOCAL_PREPARED',
  'BOOTSTRAP_AI_REQUESTED',
  'BOOTSTRAP_AI_RECEIVED',
  'BOOTSTRAP_PARSED',
  'BOOTSTRAP_PERSISTED',
  'BOOTSTRAP_KNOWLEDGE_BUILT',
  'BOOTSTRAP_COMPLETED',
  'BOOTSTRAP_FAILED',
  'BOOTSTRAP_SKIPPED',
] as const;

export type BootstrapEventType = (typeof BOOTSTRAP_EVENT_TYPES)[number];
