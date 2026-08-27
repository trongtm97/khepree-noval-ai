/** Persistent Playwright worker runtime (one per Google account). */

/** Idle close after no exclusive operation (default 10 minutes). */
export const BROWSER_RUNTIME_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Soft recycle after this many successful batches on the same context. */
export const BROWSER_RUNTIME_RECYCLE_EVERY_BATCHES = 50;

/** Poll interval for idle sweeper. */
export const BROWSER_RUNTIME_IDLE_SWEEP_MS = 30_000;

export const BROWSER_RUNTIME_EVENTS = [
  'BROWSER_RUNTIME_CREATED',
  'BROWSER_RUNTIME_REUSED',
  'BROWSER_RUNTIME_RECYCLED',
  'BROWSER_RUNTIME_CRASHED',
  'BROWSER_RUNTIME_CLOSED',
] as const;

export type BrowserRuntimeEvent = (typeof BROWSER_RUNTIME_EVENTS)[number];

export type RuntimeHealth =
  | 'READY'
  | 'BUSY'
  | 'NEEDS_ATTENTION'
  | 'CRASHED'
  | 'CLOSED';

export type RuntimeGenerationState =
  | 'IDLE'
  | 'SENDING'
  | 'GENERATING'
  | 'STABILIZING';

export function runtimeLockOwner(accountId: string): string {
  return `runtime:${accountId}`;
}

export function isRuntimeLockOwner(owner: string | null, accountId: string): boolean {
  return owner === runtimeLockOwner(accountId);
}
