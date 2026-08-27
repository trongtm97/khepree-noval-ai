/** Gemini / NotebookLM chat automation constants. */

export const GEMINI_URL = 'https://gemini.google.com/app';

/** NotebookLM notebook chat entry (opened from notebook resource URL when available). */
export const NOTEBOOKLM_URL = 'https://notebook.google.com/';

/** Default max wait for model generation (configurable per request). */
export const DEFAULT_GENERATION_MAX_TIMEOUT_MS = 120_000;

/** Full-novel NotebookLM preprocess can take much longer than one translation. */
export const PREPROCESS_GENERATION_MAX_TIMEOUT_MS = 600_000;

/** Text must stay unchanged this long before we treat streaming as complete. */
export const DEFAULT_STABILIZATION_WINDOW_MS = 1_500;

/**
 * When no generating indicator is observable, require a longer quiet window
 * before declaring RESPONSE_COMPLETE (5–8s band; default 6s).
 */
export const NO_INDICATOR_STABILIZATION_WINDOW_MS = 6_000;

/** Poll interval when waiting on DOM / text stabilization (not a blind sleep strategy). */
export const DEFAULT_DOM_POLL_INTERVAL_MS = 200;

/** Max wait after Send click for proof the prompt left the composer. */
export const DEFAULT_SEND_CONFIRM_TIMEOUT_MS = 10_000;

/** Correlation marker embedded in submitted pack — ties prompt to response. */
export const CORRELATION_MARKER_PREFIX = '[NTS-CORR:';
export const CORRELATION_MARKER_SUFFIX = ']';

export function formatCorrelationMarker(correlationId: string): string {
  return `${CORRELATION_MARKER_PREFIX}${correlationId}${CORRELATION_MARKER_SUFFIX}`;
}

export function extractCorrelationId(text: string): string | null {
  const match = /\[NTS-CORR:([0-9a-f-]{36})\]/i.exec(text);
  return match?.[1] ?? null;
}

/**
 * Fine-grained gemini_requests lifecycle (source of truth for resume / idempotency).
 * Critical: after SENT_CONFIRMED, never auto-resend.
 */
export const GEMINI_REQUEST_LIFECYCLES = [
  'CREATED',
  'COMPOSER_FILLED',
  'SEND_CLICKED',
  'SENT_CONFIRMED',
  'GENERATION_STARTED',
  'RESPONSE_SEEN',
  'RESPONSE_CAPTURED',
  'PARSED',
  'COMPLETED',
  'FAILED',
  'UNKNOWN_AFTER_CRASH',
] as const;

export type GeminiRequestLifecycle = (typeof GEMINI_REQUEST_LIFECYCLES)[number];

/** Ordered progress for resume comparisons (excludes FAILED / UNKNOWN_AFTER_CRASH). */
export const GEMINI_REQUEST_LIFECYCLE_ORDER: readonly GeminiRequestLifecycle[] = [
  'CREATED',
  'COMPOSER_FILLED',
  'SEND_CLICKED',
  'SENT_CONFIRMED',
  'GENERATION_STARTED',
  'RESPONSE_SEEN',
  'RESPONSE_CAPTURED',
  'PARSED',
  'COMPLETED',
] as const;

export function geminiLifecycleRank(lifecycle: GeminiRequestLifecycle): number {
  const idx = GEMINI_REQUEST_LIFECYCLE_ORDER.indexOf(lifecycle);
  if (idx >= 0) return idx;
  if (lifecycle === 'UNKNOWN_AFTER_CRASH') {
    // Treat as at-least SENT_CONFIRMED for recovery (never resend blindly).
    return GEMINI_REQUEST_LIFECYCLE_ORDER.indexOf('SENT_CONFIRMED');
  }
  return -1;
}

export function isGeminiLifecycleAtLeast(
  current: GeminiRequestLifecycle,
  minimum: GeminiRequestLifecycle,
): boolean {
  return geminiLifecycleRank(current) >= geminiLifecycleRank(minimum);
}

/** Coarse status kept for GeminiSendResponse / older DTOs. */
export const GEMINI_REQUEST_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type GeminiRequestStatus = (typeof GEMINI_REQUEST_STATUSES)[number];

export function coarseStatusFromLifecycle(
  lifecycle: GeminiRequestLifecycle,
): GeminiRequestStatus {
  if (lifecycle === 'COMPLETED' || lifecycle === 'PARSED') return 'completed';
  if (lifecycle === 'FAILED') return 'failed';
  if (lifecycle === 'CREATED' || lifecycle === 'COMPOSER_FILLED') return 'pending';
  return 'running';
}

export function isTerminalGeminiLifecycle(lifecycle: GeminiRequestLifecycle): boolean {
  return lifecycle === 'COMPLETED' || lifecycle === 'FAILED';
}
