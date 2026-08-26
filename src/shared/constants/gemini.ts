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

/** Poll interval when waiting on DOM / text stabilization (not a blind sleep strategy). */
export const DEFAULT_DOM_POLL_INTERVAL_MS = 200;

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

export const GEMINI_REQUEST_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type GeminiRequestStatus = (typeof GEMINI_REQUEST_STATUSES)[number];
