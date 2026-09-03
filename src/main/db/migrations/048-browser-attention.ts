export const MIGRATION_048_BROWSER_ATTENTION = `
-- Browser pool attention items (CAPTCHA / login / blocked) — user must act; no bypass

CREATE TABLE IF NOT EXISTS browser_attention_items (
  id TEXT PRIMARY KEY,
  account_kind TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT,
  provider_type TEXT,
  kind TEXT NOT NULL,
  pool_state TEXT NOT NULL,
  summary TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  diagnostics_path TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_browser_attention_open
  ON browser_attention_items(status, created_at);

CREATE INDEX IF NOT EXISTS idx_browser_attention_account
  ON browser_attention_items(account_kind, account_id, status);
`;
