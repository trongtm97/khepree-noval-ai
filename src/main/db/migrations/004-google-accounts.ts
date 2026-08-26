export const MIGRATION_004_GOOGLE_ACCOUNTS = `
-- Expand google_accounts for multi-account worker manager
ALTER TABLE google_accounts ADD COLUMN display_name TEXT;
ALTER TABLE google_accounts ADD COLUMN avatar_url TEXT;
ALTER TABLE google_accounts ADD COLUMN plan TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE google_accounts ADD COLUMN drive_connected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE google_accounts ADD COLUMN last_seen_at TEXT;
ALTER TABLE google_accounts ADD COLUMN last_used_at TEXT;
ALTER TABLE google_accounts ADD COLUMN notes TEXT;

-- Migrate legacy pending_login → LOGIN_REQUIRED
UPDATE google_accounts SET status = 'LOGIN_REQUIRED' WHERE status = 'pending_login';
UPDATE google_accounts SET status = 'READY' WHERE status = 'active';
UPDATE google_accounts SET status = 'DISABLED' WHERE status = 'disabled';
UPDATE google_accounts SET status = 'NEEDS_ATTENTION' WHERE status = 'expired';
UPDATE google_accounts SET display_name = label WHERE display_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_google_accounts_status ON google_accounts(status);
CREATE INDEX IF NOT EXISTS idx_google_accounts_plan ON google_accounts(plan);

-- Project ↔ account assignments (assigned projects per worker)
CREATE TABLE IF NOT EXISTS project_account_assignments (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  google_account_id  TEXT NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (project_id, google_account_id)
);

CREATE INDEX IF NOT EXISTS idx_project_account_project ON project_account_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_account_account ON project_account_assignments(google_account_id);
`;
