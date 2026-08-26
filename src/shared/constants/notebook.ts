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

/** Statuses where Gemini-in-Notebook may receive a slim pack (hot covers pending). */
export const NOTEBOOK_USABLE_FOR_SLIM_PACK: ReadonlySet<NotebookStatus> = new Set([
  'ready',
  'sync_pending',
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
