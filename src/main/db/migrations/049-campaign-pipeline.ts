export const MIGRATION_049_CAMPAIGN_PIPELINE = `
-- Durable per-project campaign pipeline (Prompt 08)

CREATE TABLE IF NOT EXISTS campaign_pipeline_runs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES translation_campaigns(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  status TEXT NOT NULL,
  recipe_mode TEXT NOT NULL,
  start_token TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, project_id, start_token)
);

CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_runs_campaign
  ON campaign_pipeline_runs(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_runs_active
  ON campaign_pipeline_runs(status, updated_at);

CREATE TABLE IF NOT EXISTS campaign_pipeline_stages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES campaign_pipeline_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL UNIQUE,
  input_json TEXT,
  output_json TEXT,
  checkpoint_json TEXT,
  side_effects_json TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_stages_run
  ON campaign_pipeline_stages(run_id, stage);
`;
