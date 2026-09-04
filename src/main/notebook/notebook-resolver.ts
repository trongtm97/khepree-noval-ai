import type { DatabaseManager } from '../db/database-manager';
import type { NotebookResourceRow } from '../db/repositories/notebook-repository';
import {
  inferNotebookLayout,
  isDeprecatedNotebookRole,
  roleForPurpose,
  type NotebookLayout,
  type NotebookPurpose,
  type NotebookRole,
} from '@shared/constants/notebook-role';

export function listNotebookMappingsForWorker(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookResourceRow[] {
  return db.notebooks.listByProjectAndWorker(projectId, accountId);
}

export function getNotebookLayout(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookLayout {
  const rows = listNotebookMappingsForWorker(db, projectId, accountId);
  return inferNotebookLayout(rows.map((r) => r.notebook_role as NotebookRole));
}

function isActiveNotebookRow(row: NotebookResourceRow): boolean {
  if (row.deprecated_at) return false;
  if (isDeprecatedNotebookRole(row.notebook_role)) return false;
  return true;
}

/**
 * Resolve notebook row for research or translation.
 * Phase 5: translation purpose skips deprecated TRANSLATION rows.
 */
export function resolveNotebookForPurpose(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
  purpose: NotebookPurpose,
): NotebookResourceRow | null {
  const rows = listNotebookMappingsForWorker(db, projectId, accountId).filter(isActiveNotebookRow);
  const single = rows.find((r) => r.notebook_role === 'SINGLE');
  if (single) return single;

  if (purpose === 'translation') {
    // Phase 5: translation no longer uses NotebookLM — legacy TRANSLATION deprecated.
    return null;
  }

  const targetRole = roleForPurpose(purpose);
  return rows.find((r) => r.notebook_role === targetRole) ?? null;
}

export function resolveTranslationNotebook(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookResourceRow | null {
  const rows = listNotebookMappingsForWorker(db, projectId, accountId);
  const single = rows.find((r) => r.notebook_role === 'SINGLE' && isActiveNotebookRow(r));
  if (single) return single;
  const legacy = rows.find(
    (r) => r.notebook_role === 'TRANSLATION' && isActiveNotebookRow(r) && !r.deprecated_at,
  );
  if (legacy) return legacy;

  // HARD REQUIREMENT 16 — story-level binding (Production Center / other worker).
  // Owner is projectId; fall back when this account has no row but story already bound.
  return resolveStoryNotebookRow(db, projectId);
}

/**
 * HARD REQUIREMENT 16 — resolve NotebookLM by story/project only (no create).
 */
export function resolveStoryNotebookRow(
  db: DatabaseManager,
  projectId: string,
): NotebookResourceRow | null {
  const rows = db.notebooks.listByProject(projectId).filter(isActiveNotebookRow);
  return (
    rows.find((r) => r.notebook_role === 'SINGLE' && r.notebook_id) ??
    rows.find((r) => r.notebook_id) ??
    null
  );
}

export function resolveResearchNotebook(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookResourceRow | null {
  return resolveNotebookForPurpose(db, projectId, accountId, 'research');
}

/** Rows that receive knowledge sync (00–07) — deprecated Phase 5; legacy TRANSLATION only. */
export function listKnowledgeSyncMappings(
  db: DatabaseManager,
  projectId: string,
): NotebookResourceRow[] {
  return db.notebooks
    .listByProject(projectId)
    .filter(
      (m) =>
        isActiveNotebookRow(m) &&
        (m.notebook_role === 'SINGLE' || m.notebook_role === 'TRANSLATION'),
    );
}
