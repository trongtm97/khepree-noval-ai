export const MIGRATION_050_TRANSLATION_QA_FINDINGS = `
-- Durable translation QA findings + Attention Inbox (Prompt 09)

CREATE TABLE IF NOT EXISTS translation_qa_findings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  edition_id TEXT,
  stable_paragraph_id TEXT,
  paragraph_uuid TEXT,
  job_id TEXT,
  campaign_id TEXT,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  source_range_json TEXT,
  target_range_json TEXT,
  evidence_json TEXT,
  suggested_action TEXT NOT NULL,
  term_source TEXT,
  expected_text TEXT,
  found_text TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  fingerprint TEXT NOT NULL,
  source_hash TEXT,
  dismissed_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dismissed_at TEXT,
  resolved_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_findings_fingerprint
  ON translation_qa_findings(project_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_qa_findings_open
  ON translation_qa_findings(project_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_qa_findings_paragraph
  ON translation_qa_findings(project_id, stable_paragraph_id, status);
`;
