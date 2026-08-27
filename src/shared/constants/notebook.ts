export const NOTEBOOK_URL = 'https://notebook.google.com/';
/** Legacy host still redirects here. */
export const NOTEBOOK_URL_LEGACY = 'https://notebooklm.google.com/';

export const NOTEBOOK_NAME_PREFIX = '[NovelTrans]';

export function formatNotebookName(novelName: string): string {
  const cleaned = novelName.trim().replace(/\s+/g, ' ').slice(0, 120);
  return `${NOTEBOOK_NAME_PREFIX} ${cleaned || 'Untitled'}`;
}

export const NOTEBOOK_STATUSES = [
  'pending',
  'provisioning',
  'ready',
  'assisted_setup',
  'error',
  'unavailable',
  'syncing',
  'stale',
  'sync_pending',
] as const;

export type NotebookStatus = (typeof NOTEBOOK_STATUSES)[number];

/**
 * Statuses eligible for SLIM only when knowledge version is also verified
 * and source grounding confirmed (see resolveTranslationPackMode).
 * sync_pending / stale → HYBRID, never SLIM.
 */
export const NOTEBOOK_USABLE_FOR_SLIM_PACK: ReadonlySet<NotebookStatus> = new Set([
  'ready',
]);

/**
 * Notebook exists and can still supply cold knowledge — local delta fills the gap.
 * Includes ready (version mismatch / unverified → hybrid) plus sync_pending / stale.
 */
export const NOTEBOOK_USABLE_FOR_HYBRID_PACK: ReadonlySet<NotebookStatus> = new Set([
  'ready',
  'sync_pending',
  'stale',
]);

/** Statuses that count as a live Notebook channel for preflight. */
export const NOTEBOOK_CHANNEL_READY: ReadonlySet<string> = new Set([
  'ready',
  'sync_pending',
  'syncing',
]);

export const NOTEBOOK_ASSISTED_STEPS = [
  'create_notebook',
  'add_sources',
  'set_instructions',
  'verify',
] as const;

export type NotebookAssistedStep = (typeof NOTEBOOK_ASSISTED_STEPS)[number];
