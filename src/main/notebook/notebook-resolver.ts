import type { DatabaseManager } from '../db/database-manager';
import type { NotebookResourceRow } from '../db/repositories/notebook-repository';
import {
  inferNotebookLayout,
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

/**
 * Resolve notebook row for research or translation.
 * SINGLE row serves both purposes (legacy / one-notebook mode).
 */
export function resolveNotebookForPurpose(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
  purpose: NotebookPurpose,
): NotebookResourceRow | null {
  const rows = listNotebookMappingsForWorker(db, projectId, accountId);
  const single = rows.find((r) => r.notebook_role === 'SINGLE');
  if (single) return single;

  const targetRole = roleForPurpose(purpose);
  return rows.find((r) => r.notebook_role === targetRole) ?? null;
}

export function resolveTranslationNotebook(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookResourceRow | null {
  return resolveNotebookForPurpose(db, projectId, accountId, 'translation');
}

export function resolveResearchNotebook(
  db: DatabaseManager,
  projectId: string,
  accountId: string,
): NotebookResourceRow | null {
  return resolveNotebookForPurpose(db, projectId, accountId, 'research');
}

/** Rows that receive knowledge sync (00–07) — not RESEARCH corpus notebooks. */
export function listKnowledgeSyncMappings(
  db: DatabaseManager,
  projectId: string,
): NotebookResourceRow[] {
  return db.notebooks
    .listByProject(projectId)
    .filter((m) => m.notebook_role === 'SINGLE' || m.notebook_role === 'TRANSLATION');
}
