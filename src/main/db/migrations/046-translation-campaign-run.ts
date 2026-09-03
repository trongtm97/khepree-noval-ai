export const MIGRATION_046_TRANSLATION_CAMPAIGN_RUN = `
-- Campaign plan / start idempotency / job linkage

ALTER TABLE translation_campaigns ADD COLUMN plan_json TEXT;
ALTER TABLE translation_campaigns ADD COLUMN start_token TEXT;
ALTER TABLE translation_campaigns ADD COLUMN started_at TEXT;
ALTER TABLE translation_campaigns ADD COLUMN paused_at TEXT;
ALTER TABLE translation_campaigns ADD COLUMN completed_at TEXT;
ALTER TABLE translation_campaigns ADD COLUMN last_error TEXT;

ALTER TABLE translation_campaign_projects ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE translation_campaign_projects ADD COLUMN selected INTEGER NOT NULL DEFAULT 1;
ALTER TABLE translation_campaign_projects ADD COLUMN preflight_json TEXT;
ALTER TABLE translation_campaign_projects ADD COLUMN blocker_code TEXT;

CREATE TABLE IF NOT EXISTS translation_campaign_jobs (
  campaign_id TEXT NOT NULL REFERENCES translation_campaigns(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  chapter_from INTEGER NOT NULL,
  chapter_to INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, job_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_jobs_fingerprint
  ON translation_campaign_jobs(campaign_id, project_id, chapter_from, chapter_to);

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_project
  ON translation_campaign_jobs(campaign_id, project_id);
`;
