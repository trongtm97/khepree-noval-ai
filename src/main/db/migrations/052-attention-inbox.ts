export const MIGRATION_052_ATTENTION_INBOX = `
-- Central Attention Inbox (Prompt 11)

CREATE TABLE IF NOT EXISTS attention_inbox_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  severity TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_vi TEXT NOT NULL,
  cause_code TEXT,
  primary_action TEXT NOT NULL,
  secondary_actions_json TEXT,
  campaign_id TEXT,
  project_id TEXT,
  chapter_id TEXT,
  job_id TEXT,
  account_id TEXT,
  account_kind TEXT,
  affected_scope_json TEXT,
  dedupe_key TEXT NOT NULL,
  tech_detail TEXT,
  snoozed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attention_inbox_open_dedupe
  ON attention_inbox_items(dedupe_key)
  WHERE status IN ('OPEN', 'SNOOZED');

CREATE INDEX IF NOT EXISTS idx_attention_inbox_open
  ON attention_inbox_items(status, severity, updated_at);

CREATE INDEX IF NOT EXISTS idx_attention_inbox_project
  ON attention_inbox_items(project_id, status);
`;
