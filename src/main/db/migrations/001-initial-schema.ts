export const MIGRATION_001_INITIAL_SCHEMA = `
-- schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL,
  checksum    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Google accounts & auth
CREATE TABLE IF NOT EXISTS google_accounts (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending_login',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_browser_profiles (
  id                    TEXT PRIMARY KEY,
  google_account_id     TEXT NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  profile_dir_name      TEXT NOT NULL,
  last_session_check_at TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (google_account_id)
);

CREATE TABLE IF NOT EXISTS google_oauth_credentials (
  id                TEXT PRIMARY KEY,
  google_account_id TEXT NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  credential_type   TEXT NOT NULL,
  encrypted_blob    BLOB NOT NULL,
  expires_at        TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  source_language  TEXT NOT NULL DEFAULT 'zh',
  target_language  TEXT NOT NULL DEFAULT 'vi',
  genre            TEXT,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);

CREATE TABLE IF NOT EXISTS project_settings (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  style_config  TEXT,
  import_config TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Chapters & paragraphs
CREATE TABLE IF NOT EXISTS chapters (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  chapter_title  TEXT,
  source_text    TEXT,
  source_hash    TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (project_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS chapter_paragraphs (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  paragraph_id TEXT NOT NULL,
  sequence     INTEGER NOT NULL,
  source_text  TEXT NOT NULL,
  source_hash  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (chapter_id, paragraph_id),
  UNIQUE (chapter_id, sequence)
);

CREATE TABLE IF NOT EXISTS translations (
  id              TEXT PRIMARY KEY,
  paragraph_id    TEXT NOT NULL REFERENCES chapter_paragraphs(id) ON DELETE CASCADE,
  translated_text TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  provider        TEXT,
  model           TEXT,
  metadata        TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_versions (
  id              TEXT PRIMARY KEY,
  translation_id  TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  translated_text TEXT,
  status          TEXT NOT NULL,
  provider        TEXT,
  model           TEXT,
  metadata        TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (translation_id, version)
);

-- Characters
CREATE TABLE IF NOT EXISTS characters (
  id                            TEXT PRIMARY KEY,
  project_id                    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  canonical_name                TEXT NOT NULL,
  translated_name               TEXT,
  gender                        TEXT,
  role                          TEXT,
  description                   TEXT,
  first_appearance_paragraph_id TEXT,
  metadata                      TEXT,
  created_at                    TEXT NOT NULL,
  updated_at                    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_aliases (
  id           TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  alias        TEXT NOT NULL,
  alias_type   TEXT NOT NULL DEFAULT 'name',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_relationships (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  to_character_id    TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relationship_type  TEXT NOT NULL,
  description        TEXT,
  since_paragraph_id TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Terms
CREATE TABLE IF NOT EXISTS terms (
  id                TEXT PRIMARY KEY,
  source_simplified TEXT NOT NULL,
  source_traditional TEXT,
  pinyin            TEXT,
  term_type         TEXT NOT NULL DEFAULT 'other',
  genre             TEXT,
  scope             TEXT NOT NULL,
  scope_ref         TEXT,
  status            TEXT NOT NULL DEFAULT 'DISCOVERED',
  confidence        REAL,
  occurrence_count  INTEGER NOT NULL DEFAULT 0,
  novel_count       INTEGER NOT NULL DEFAULT 0,
  locked            INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE IF NOT EXISTS term_translations (
  id          TEXT PRIMARY KEY,
  term_id     TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  target_text TEXT NOT NULL,
  is_primary  INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS term_occurrences (
  id              TEXT PRIMARY KEY,
  term_id         TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id      TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  paragraph_id    TEXT,
  context_snippet TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_terms (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  term_id    TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  status     TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, term_id)
);

-- Memory & story state
CREATE TABLE IF NOT EXISTS story_states (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  current_chapter_number INTEGER,
  state_json            TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_events (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  event_key   TEXT NOT NULL,
  event_value TEXT,
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (project_id, category, event_key)
);

-- Jobs & workers
CREATE TABLE IF NOT EXISTS worker_states (
  id                TEXT PRIMARY KEY,
  google_account_id TEXT NOT NULL UNIQUE REFERENCES google_accounts(id) ON DELETE CASCADE,
  provider_type     TEXT NOT NULL DEFAULT 'gemini',
  quota_state       TEXT NOT NULL DEFAULT 'ok',
  quota_reset_at    TEXT,
  is_enabled        INTEGER NOT NULL DEFAULT 1,
  priority          INTEGER NOT NULL DEFAULT 100,
  config            TEXT,
  last_active_at    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'QUEUED',
  worker_id     TEXT REFERENCES worker_states(id) ON DELETE SET NULL,
  config        TEXT,
  progress      TEXT,
  error         TEXT,
  paused_reason TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS job_attempts (
  id             TEXT PRIMARY KEY,
  job_id         TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  state          TEXT NOT NULL,
  error          TEXT,
  started_at     TEXT,
  completed_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (job_id, attempt_number)
);

-- Drive & notebook resources
CREATE TABLE IF NOT EXISTS drive_resources (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drive_file_id  TEXT NOT NULL,
  resource_type  TEXT NOT NULL,
  local_path     TEXT,
  remote_hash    TEXT,
  local_hash     TEXT,
  last_synced_at TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notebook_resources (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  notebook_id             TEXT,
  resource_url            TEXT,
  linked_drive_resource_id TEXT REFERENCES drive_resources(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_events (
  id              TEXT PRIMARY KEY,
  job_id          TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  worker_id       TEXT REFERENCES worker_states(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  payload         TEXT,
  screenshot_path TEXT,
  created_at      TEXT NOT NULL
);
`;
