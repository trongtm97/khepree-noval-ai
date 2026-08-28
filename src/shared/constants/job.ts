/** Job + automatic repair + scheduler constants. */

export const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;

/** User-facing cap on chapters per translation job (engine may shrink further). */
export const DEFAULT_MAX_CHAPTERS_PER_JOB = 3;

/** Max CONTINUATION rounds when Gemini output is truncated. */
export const DEFAULT_MAX_CONTINUATION_ATTEMPTS = 3;

/** Missing paragraphs at or below this → per-paragraph repair; above → CONTINUATION. */
export const CONTINUATION_REPAIR_THRESHOLD = 5;

/**
 * Max source paragraphs per translate job (Web API).
 * Larger batches often make Gemini Web API return soft errors
 * ("Sorry, something went wrong") instead of protocol output.
 */
export const DEFAULT_TRANSLATE_BATCH_PARAGRAPHS = 12;

/**
 * NotebookLM / Playwright can take much larger prompts than Web API.
 * Use when PLAYWRIGHT_GEMINI is the first ordered provider for the job.
 */
export const PLAYWRIGHT_TRANSLATE_BATCH_PARAGRAPHS = 120;

/** Soft cap on source chars per Playwright chunk (pack overhead adds ~10–15k). */
export const PLAYWRIGHT_MAX_SOURCE_CHARS_PER_CHUNK = 40_000;

/** Web API char budget per chapter batch (smaller than Playwright). */
export const WEB_API_MAX_SOURCE_CHARS_PER_CHUNK = 8_000;

/** Global max concurrent Chromium profiles / workers (legacy fixed default). */
export const DEFAULT_MAX_CONCURRENT_WORKERS = 3;

/** Lease duration for claimed jobs (crash recovery). Renewed while job runs. */
export const DEFAULT_JOB_LEASE_MS = 15 * 60 * 1000;

/** How often an in-flight job renews its lease (must be << DEFAULT_JOB_LEASE_MS). */
export const DEFAULT_LEASE_HEARTBEAT_MS = 30_000;

/** Scheduler tick interval. */
export const DEFAULT_SCHEDULER_TICK_MS = 500;

/** After QUOTA_LIMIT, do not re-pick worker until this cooldown. */
export const DEFAULT_QUOTA_COOLDOWN_MS = 30 * 60 * 1000;

export const REPAIR_REASONS = [
  'MISSING_PARAGRAPH',
  'EMPTY_PARAGRAPH',
  'CORRUPT_PARAGRAPH',
  'MALFORMED_OUTPUT',
  'TERM_VIOLATION',
  'MEMORY_JSON_INVALID',
  'OUTPUT_INCOMPLETE',
] as const;

export type RepairReason = (typeof REPAIR_REASONS)[number];

/**
 * Full job flow (Phase 15).
 * RUNNING kept for backward-compat with Phase 14 repair-only path.
 */
export const JOB_STATES = [
  'QUEUED',
  'PREPARING',
  'WAITING_WORKER',
  'SENDING',
  'WAITING_AI',
  'RUNNING',
  'PARSING',
  'QA',
  'REPAIRING',
  'COMPLETED',
  'NEEDS_ATTENTION',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
  'ACCEPTED_WITH_WARNINGS',
  'PAUSED',
] as const;

export type JobState = (typeof JOB_STATES)[number];

/** Terminal / non-runnable states. */
export const JOB_TERMINAL_STATES: ReadonlySet<JobState> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
  'ACCEPTED_WITH_WARNINGS',
]);

export const JOB_ATTEMPT_STATES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CRASHED',
] as const;

export type JobAttemptState = (typeof JOB_ATTEMPT_STATES)[number];

export const ATTENTION_ACTIONS = [
  'retry',
  'skip',
  'manual_fix',
  'accept_with_warning',
] as const;

export type AttentionAction = (typeof ATTENTION_ACTIONS)[number];

export const REPAIR_PROMPT_MODES = [
  'translation_missing',
  'translation_empty',
  'translation_corrupt',
  'malformed_full',
  'protocol_recovery',
  'term_violation',
  'deltas_only',
  'continuation',
] as const;

export type RepairPromptMode = (typeof REPAIR_PROMPT_MODES)[number];

export const WORKER_MODES = ['PINNED', 'POOL'] as const;
export type WorkerMode = (typeof WORKER_MODES)[number];

/** Scheduler-facing worker health (persisted on worker_states.health). */
export const WORKER_HEALTH = [
  'READY',
  'BUSY',
  'LIMITED',
  'NEEDS_ATTENTION',
  'OFFLINE',
  'DISABLED',
] as const;

export type WorkerHealth = (typeof WORKER_HEALTH)[number];

export const SCHEDULER_SETTING_KEYS = {
  maxConcurrentWorkers: 'scheduler.max_concurrent_workers',
  pauseAll: 'scheduler.pause_all',
  tickMs: 'scheduler.tick_ms',
  quotaCooldownMs: 'scheduler.quota_cooldown_ms',
} as const;

/** @deprecated Prefer DEFAULT_AUTO_GLOBAL_CAP + AUTO mode from concurrency-policy. */
export { DEFAULT_AUTO_GLOBAL_CAP } from './concurrency-policy';
