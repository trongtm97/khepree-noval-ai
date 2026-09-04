import type { MigrationDefinition } from '../migration-runner';

/**
 * HARD REQUIREMENT 18 — Notebook binding compatibility for existing installs.
 *
 * - Does NOT rename persisted columns on `notebook_resources`.
 * - Does NOT create bindings for stories that have none.
 * - Only normalizes empty role/status so older rows remain readable.
 */
export function runMigration058NotebookBindingCompat(
  db: import('better-sqlite3').Database,
): void {
  db.exec(`
    UPDATE notebook_resources
    SET notebook_role = 'SINGLE'
    WHERE notebook_role IS NULL OR trim(notebook_role) = '';

    UPDATE notebook_resources
    SET status = 'pending'
    WHERE status IS NULL OR trim(status) = '';
  `);
}

export const MIGRATION_058_NOTEBOOK_BINDING_COMPAT: MigrationDefinition = {
  version: 58,
  name: 'notebook_binding_compat',
  sql: `-- HR18: tolerate unbound stories; normalize empty role/status; never invent bindings
-- Persisted keys unchanged: project_id, notebook_id, resource_url, notebook_role, status, …`,
  run: runMigration058NotebookBindingCompat,
};
