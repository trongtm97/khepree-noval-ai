/** Scheduler fairness / backpressure / concurrent-novel caps (Prompt 06). */

import { CAMPAIGN_APP_META_LIMIT_KEYS, CAMPAIGN_DEFAULT_LIMITS } from './translation-campaign';

/** Soft queue depth before tick claims only 1 job (backpressure). */
export const SCHEDULER_QUEUE_BACKPRESSURE_DEPTH = 2_000;

/** Hard page size for job list queries (never load entire table into RAM). */
export const JOB_LIST_PAGE_DEFAULT = 50;
export const JOB_LIST_PAGE_MAX = 200;

/** Cap distinct novels running at once when capability/machine/READY allow more. */
export function resolveConcurrentNovelCap(input: {
  capabilityMax: number;
  machineMax: number;
  readyProfiles: number;
}): number {
  const capability = Math.max(1, Math.floor(input.capabilityMax));
  const machine = Math.max(1, Math.floor(input.machineMax));
  const ready = Math.max(1, Math.floor(input.readyProfiles));
  return Math.max(1, Math.min(capability, machine, ready));
}

export function readCapabilityMaxConcurrentNovels(
  getMeta: (key: string) => string | null,
): number {
  const raw = getMeta(CAMPAIGN_APP_META_LIMIT_KEYS.maxConcurrentNovels);
  if (raw == null || raw === '') return CAMPAIGN_DEFAULT_LIMITS.maxConcurrentNovels;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return CAMPAIGN_DEFAULT_LIMITS.maxConcurrentNovels;
  return n;
}

export function claimsAllowedThisTick(input: {
  capacity: number;
  queueDepth: number;
  backpressureDepth?: number;
}): number {
  const capacity = Math.max(0, input.capacity);
  if (capacity === 0) return 0;
  const threshold = input.backpressureDepth ?? SCHEDULER_QUEUE_BACKPRESSURE_DEPTH;
  if (input.queueDepth >= threshold) return 1;
  return capacity;
}
