export const MIGRATION_047_USAGE_LEDGER = `
-- Local usage telemetry for ETA / slow-account detection (not token billing)

CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  job_id TEXT,
  account_id TEXT,
  provider_type TEXT,
  request_count INTEGER NOT NULL DEFAULT 1,
  char_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_project_created
  ON usage_ledger(project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_account_created
  ON usage_ledger(account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_job
  ON usage_ledger(job_id);
`;
