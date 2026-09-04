import type { MigrationDefinition } from '../migration-runner';
import { auditHistoricalNotebookBindingDuplicates } from '../../notebook/notebook-binding-duplicate-audit';

/**
 * HARD REQUIREMENT 14 — historical duplicate NotebookLM bindings per story.
 * Local audit only. Never deletes remote NotebookLM projects.
 */
export function runMigration057NotebookBindingDuplicateAudit(
  db: import('better-sqlite3').Database,
): void {
  auditHistoricalNotebookBindingDuplicates(db);
}

export const MIGRATION_057_NOTEBOOK_BINDING_DUPLICATE_AUDIT: MigrationDefinition = {
  version: 57,
  name: 'notebook_binding_duplicate_audit',
  sql: '-- HR14: audit duplicate notebook_resources per story (local deprecate / user resolve; no remote delete)',
  run: runMigration057NotebookBindingDuplicateAudit,
};
