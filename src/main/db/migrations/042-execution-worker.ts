export const MIGRATION_042_EXECUTION_WORKER = `
-- Provider-neutral job execution persistence (backward-compatible)
ALTER TABLE jobs ADD COLUMN execution_worker_id TEXT;
ALTER TABLE jobs ADD COLUMN execution_provider_id TEXT;
ALTER TABLE jobs ADD COLUMN execution_provider_type TEXT;
ALTER TABLE jobs ADD COLUMN execution_account_kind TEXT;
ALTER TABLE jobs ADD COLUMN execution_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_execution_worker
  ON jobs(execution_worker_id);

CREATE INDEX IF NOT EXISTS idx_jobs_execution_account
  ON jobs(execution_account_id, execution_provider_id);

-- Generic AI request lifecycle (gemini_requests retained for history)
CREATE TABLE IF NOT EXISTS ai_requests (
  id                  TEXT PRIMARY KEY,
  correlation_id      TEXT NOT NULL UNIQUE,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_id         TEXT NOT NULL,
  provider_type       TEXT NOT NULL,
  account_kind        TEXT NOT NULL,
  account_id          TEXT NOT NULL,
  job_id              TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  request_id          TEXT,
  pack_hash           TEXT,
  status              TEXT NOT NULL,
  lifecycle           TEXT,
  raw_response_path   TEXT,
  error_code          TEXT,
  error_message       TEXT,
  started_at          TEXT NOT NULL,
  completed_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_project ON ai_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_account ON ai_requests(account_kind, account_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_provider ON ai_requests(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_requests_job ON ai_requests(job_id);
`;
