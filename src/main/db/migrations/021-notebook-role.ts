/**
 * Add notebook_role (RESEARCH | TRANSLATION | SINGLE) for dual-notebook layout.
 * Existing rows backfill to SINGLE for backward compatibility.
 */
export const MIGRATION_021_NOTEBOOK_ROLE = `
ALTER TABLE notebook_resources ADD COLUMN notebook_role TEXT NOT NULL DEFAULT 'SINGLE';

UPDATE notebook_resources SET notebook_role = 'SINGLE' WHERE notebook_role IS NULL OR notebook_role = '';

DROP INDEX IF EXISTS idx_notebook_project_worker;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_project_worker_role
  ON notebook_resources(project_id, google_account_id, notebook_role)
  WHERE google_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notebook_resources_role
  ON notebook_resources(project_id, notebook_role);
`;
