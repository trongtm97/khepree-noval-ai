export const MIGRATION_006_MEMORY_ENGINE = `
ALTER TABLE characters ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE characters ADD COLUMN first_chapter INTEGER;
ALTER TABLE characters ADD COLUMN last_chapter INTEGER;
ALTER TABLE characters ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

ALTER TABLE character_relationships ADD COLUMN a_calls_b TEXT;
ALTER TABLE character_relationships ADD COLUMN b_calls_a TEXT;
ALTER TABLE character_relationships ADD COLUMN valid_from_chapter INTEGER;
ALTER TABLE character_relationships ADD COLUMN valid_to_chapter INTEGER;
ALTER TABLE character_relationships ADD COLUMN confidence REAL;
ALTER TABLE character_relationships ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE character_relationships ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

ALTER TABLE story_states ADD COLUMN summary_text TEXT;
ALTER TABLE story_states ADD COLUMN cultivation_state TEXT;
ALTER TABLE story_states ADD COLUMN location_state TEXT;
ALTER TABLE story_states ADD COLUMN important_items TEXT;
ALTER TABLE story_states ADD COLUMN unresolved_plot_points TEXT;
ALTER TABLE story_states ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

ALTER TABLE memory_events ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_events ADD COLUMN chapter_number INTEGER;

CREATE TABLE IF NOT EXISTS memory_conflicts (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  field_key       TEXT NOT NULL,
  existing_value  TEXT,
  proposed_value  TEXT,
  delta_source    TEXT NOT NULL DEFAULT 'ai_delta',
  status          TEXT NOT NULL DEFAULT 'PENDING',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_conflicts_project ON memory_conflicts(project_id);
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_status ON memory_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_character_relationships_from ON character_relationships(from_character_id);
CREATE INDEX IF NOT EXISTS idx_character_relationships_to ON character_relationships(to_character_id);
`;
