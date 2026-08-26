const NOTIFY_STATES = new Set([
  'COMPLETED',
  'FAILED',
  'NEEDS_ATTENTION',
  'ACCEPTED_WITH_WARNINGS',
]);

const DEFAULT_RECENT_MS = 120_000;

/** Notify on state change, or first sight of a recent terminal job (fast-fail). */
export function shouldNotifyJobTransition(
  prev: string | undefined,
  next: string,
  updatedAt: string | null | undefined,
  nowMs: number,
  recentMs = DEFAULT_RECENT_MS,
): boolean {
  if (!NOTIFY_STATES.has(next)) return false;
  if (prev && prev !== next) return true;
  if (prev) return false;
  if (!updatedAt) return false;
  const updatedMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedMs)) return false;
  return nowMs - updatedMs <= recentMs;
}
