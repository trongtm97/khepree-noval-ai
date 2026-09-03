export const MIGRATION_045_TRANSLATION_RECIPES = `
-- User translation recipes + campaigns with recipe snapshots

CREATE TABLE IF NOT EXISTS translation_recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,
  version TEXT NOT NULL,
  config_json TEXT NOT NULL,
  cloned_from_id TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_translation_recipes_active
  ON translation_recipes(deleted_at, updated_at);

CREATE TABLE IF NOT EXISTS translation_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  recipe_snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_translation_campaigns_active
  ON translation_campaigns(deleted_at, updated_at);

CREATE TABLE IF NOT EXISTS translation_campaign_projects (
  campaign_id TEXT NOT NULL REFERENCES translation_campaigns(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  override_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, project_id)
);
`;
