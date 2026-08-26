export const MIGRATION_007_DRIVE_SYNC = `
ALTER TABLE drive_resources ADD COLUMN google_account_id TEXT REFERENCES google_accounts(id) ON DELETE SET NULL;
ALTER TABLE drive_resources ADD COLUMN resource_key TEXT;
ALTER TABLE drive_resources ADD COLUMN remote_modified_time TEXT;
ALTER TABLE drive_resources ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE drive_resources ADD COLUMN last_error TEXT;

CREATE TABLE IF NOT EXISTS drive_sync_state (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  google_account_id       TEXT REFERENCES google_accounts(id) ON DELETE SET NULL,
  root_folder_id          TEXT,
  sync_every_n_chapters   INTEGER NOT NULL DEFAULT 10,
  chapters_since_sync     INTEGER NOT NULL DEFAULT 0,
  critical_change_pending INTEGER NOT NULL DEFAULT 0,
  last_sync_at            TEXT,
  sync_status             TEXT NOT NULL DEFAULT 'idle',
  last_error              TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_resources_project_key
  ON drive_resources(project_id, resource_key)
  WHERE resource_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drive_resources_account ON drive_resources(google_account_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_state_account ON drive_sync_state(google_account_id);
`;
