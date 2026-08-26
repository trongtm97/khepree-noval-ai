export const MIGRATION_009_GEMINI_PROVIDER = `
CREATE TABLE IF NOT EXISTS gemini_requests (
  id                  TEXT PRIMARY KEY,
  correlation_id      TEXT NOT NULL UNIQUE,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  google_account_id   TEXT NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  job_id              TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  pack_hash           TEXT NOT NULL,
  status              TEXT NOT NULL,
  raw_response_path   TEXT,
  error_code          TEXT,
  error_message       TEXT,
  started_at          TEXT NOT NULL,
  completed_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gemini_requests_project ON gemini_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_gemini_requests_account ON gemini_requests(google_account_id);
CREATE INDEX IF NOT EXISTS idx_gemini_requests_status ON gemini_requests(status);
`;
