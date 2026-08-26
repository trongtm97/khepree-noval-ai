export const MIGRATION_008_NOTEBOOK_PROVIDER = `
ALTER TABLE notebook_resources ADD COLUMN google_account_id TEXT REFERENCES google_accounts(id) ON DELETE SET NULL;
ALTER TABLE notebook_resources ADD COLUMN notebook_name TEXT;
ALTER TABLE notebook_resources ADD COLUMN last_verified_at TEXT;
ALTER TABLE notebook_resources ADD COLUMN assisted_step TEXT;
ALTER TABLE notebook_resources ADD COLUMN last_error TEXT;
ALTER TABLE notebook_resources ADD COLUMN instructions_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_project_worker
  ON notebook_resources(project_id, google_account_id)
  WHERE google_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notebook_resources_account ON notebook_resources(google_account_id);
`;
