export const MIGRATION_051_WHOLE_BOOK_AUDIT = `
-- Whole-book Audit runs (Prompt 10) — resumable local aggregate + findings

CREATE TABLE IF NOT EXISTS whole_book_audit_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  edition_id TEXT,
  campaign_id TEXT,
  status TEXT NOT NULL,
  recipe_mode TEXT,
  last_chapter_index INTEGER NOT NULL DEFAULT 0,
  chapters_total INTEGER NOT NULL DEFAULT 0,
  findings_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  report_json_path TEXT,
  report_html_path TEXT,
  checkpoint_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_whole_book_audit_project
  ON whole_book_audit_runs(project_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_qa_findings_campaign
  ON translation_qa_findings(campaign_id, status);
`;
