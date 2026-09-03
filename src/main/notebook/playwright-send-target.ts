import type { PackMode } from '@shared/constants/pack-mode';
import { GEMINI_WEB_CHAT_URL } from '@shared/constants/notebook-role';
import type { DatabaseManager } from '../db/database-manager';
import type { NotebookResourceRow } from '../db/repositories/notebook-repository';
import { listNotebookMappingsForWorker } from './notebook-resolver';

/** Statuses eligible for Playwright send when notebook_assisted. */
export const PLAYWRIGHT_SEND_READY_STATUSES = new Set([
  'ready',
  'sync_pending',
  'stale',
]);

const LEGACY_HEAL_SKIP_STATUSES = new Set([
  'ready',
  'sync_pending',
  'stale',
  'assisted_setup',
]);

export interface PlaywrightSendTarget {
  notebookUrl: string;
  notebookRowId: string | null;
  mapping: NotebookResourceRow | null;
  usedWebChatFallback: boolean;
  reason: string;
}

function isHttpNotebookUrl(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith('http'));
}

function isSendReadyRow(row: NotebookResourceRow): boolean {
  return PLAYWRIGHT_SEND_READY_STATUSES.has(row.status);
}

function pickNotebookAssistedMapping(
  rows: NotebookResourceRow[],
): NotebookResourceRow | null {
  const single = rows.find((r) => r.notebook_role === 'SINGLE' && !r.deprecated_at);
  if (single && isSendReadyRow(single) && isHttpNotebookUrl(single.resource_url)) {
    return single;
  }
  const legacy = rows.find(
    (r) =>
      r.notebook_role === 'TRANSLATION' &&
      !r.deprecated_at &&
      isSendReadyRow(r) &&
      isHttpNotebookUrl(r.resource_url),
  );
  return legacy ?? null;
}

/**
 * Deprecate legacy TRANSLATION rows stuck in pending/error (align migration 037).
 */
export function healLegacyTranslationNotebookMappings(
  db: DatabaseManager,
  projectId: string,
): number {
  const rows = db.notebooks.listByProject(projectId).filter(
    (r) => r.notebook_role === 'TRANSLATION' && !r.deprecated_at,
  );
  let healed = 0;
  for (const row of rows) {
    if (LEGACY_HEAL_SKIP_STATUSES.has(row.status)) continue;
    db.notebooks.markDeprecated(row.id);
    db.knowledgeSyncEvents.insert({
      projectId,
      eventType: 'NOTEBOOK_LEGACY_DEPRECATED',
      message: `Legacy Translation Notebook deprecated (status=${row.status}).`,
      metadata: {
        notebookId: row.id,
        notebookRole: row.notebook_role,
        previousStatus: row.status,
      },
    });
    healed += 1;
  }
  return healed;
}

/**
 * Resolve Playwright navigation target — never throws for legacy not-ready when local_context.
 */
export function resolvePlaywrightSendTarget(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
  packMode: PackMode,
): PlaywrightSendTarget {
  const rows = listNotebookMappingsForWorker(db, projectId, accountId);

  if (packMode === 'local_context') {
    return {
      notebookUrl: GEMINI_WEB_CHAT_URL,
      notebookRowId: null,
      mapping: null,
      usedWebChatFallback: true,
      reason: 'local_context_web_chat',
    };
  }

  const mapping = pickNotebookAssistedMapping(rows);
  if (mapping?.resource_url) {
    return {
      notebookUrl: mapping.resource_url,
      notebookRowId: mapping.id,
      mapping,
      usedWebChatFallback: false,
      reason: 'notebook_assisted_ready',
    };
  }

  const assisted = rows.find(
    (r) =>
      (r.notebook_role === 'SINGLE' || r.notebook_role === 'TRANSLATION') &&
      !r.deprecated_at &&
      r.status === 'assisted_setup',
  );
  if (assisted) {
    return {
      notebookUrl: assisted.resource_url?.startsWith('http')
        ? assisted.resource_url
        : GEMINI_WEB_CHAT_URL,
      notebookRowId: assisted.id,
      mapping: assisted,
      usedWebChatFallback: false,
      reason: 'notebook_assisted_needs_resume',
    };
  }

  return {
    notebookUrl: GEMINI_WEB_CHAT_URL,
    notebookRowId: null,
    mapping: null,
    usedWebChatFallback: true,
    reason: 'notebook_assisted_not_provisioned',
  };
}
