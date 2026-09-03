export const MIGRATION_055_LIBRARY_SEARCH = `
-- Unified local library FTS (Prompt 17)

CREATE VIRTUAL TABLE IF NOT EXISTS library_search_fts USING fts5(
  entity_key UNINDEXED,
  entity_type UNINDEXED,
  project_id UNINDEXED,
  series_id UNINDEXED,
  status UNINDEXED,
  language UNINDEXED,
  body,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS library_search_dirty (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_library_search_dirty_created
  ON library_search_dirty(created_at);

CREATE TABLE IF NOT EXISTS library_search_index_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase TEXT,
  last_entity_key TEXT,
  entities_total INTEGER NOT NULL DEFAULT 0,
  entities_done INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  checkpoint_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_library_search_runs_status
  ON library_search_index_runs(status, updated_at);

-- Dirty queue triggers (metadata always; body rebuilt with user prefs in indexer)
CREATE TRIGGER IF NOT EXISTS projects_lib_search_dirty_ai AFTER INSERT ON projects BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('project', new.id, new.id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS projects_lib_search_dirty_au AFTER UPDATE ON projects BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('project', new.id, new.id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS projects_lib_search_fts_ad AFTER DELETE ON projects BEGIN
  DELETE FROM library_search_fts WHERE project_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS chapters_lib_search_dirty_ai AFTER INSERT ON chapters BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('chapter', new.id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS chapters_lib_search_dirty_au AFTER UPDATE ON chapters BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('chapter', new.id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS chapters_lib_search_fts_ad AFTER DELETE ON chapters BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'chapter:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS terms_lib_search_dirty_ai AFTER INSERT ON terms BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('term', new.id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS terms_lib_search_dirty_au AFTER UPDATE ON terms BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('term', new.id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS terms_lib_search_fts_ad AFTER DELETE ON terms BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'term:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS characters_lib_search_dirty_ai AFTER INSERT ON characters BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('character', new.id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS characters_lib_search_dirty_au AFTER UPDATE ON characters BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('character', new.id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS characters_lib_search_fts_ad AFTER DELETE ON characters BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'character:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS translations_lib_search_dirty_ai AFTER INSERT ON translations BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('translation', new.id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS translations_lib_search_dirty_au AFTER UPDATE ON translations BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('translation', new.id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS translations_lib_search_fts_ad AFTER DELETE ON translations BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'translation:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS qa_findings_lib_search_dirty_ai AFTER INSERT ON translation_qa_findings BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('qa_finding', new.id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS qa_findings_lib_search_dirty_au AFTER UPDATE ON translation_qa_findings BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('qa_finding', new.id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS qa_findings_lib_search_fts_ad AFTER DELETE ON translation_qa_findings BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'qa_finding:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS fiction_series_lib_search_dirty_ai AFTER INSERT ON fiction_series BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS fiction_series_lib_search_dirty_au AFTER UPDATE ON fiction_series BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS fiction_series_lib_search_fts_ad AFTER DELETE ON fiction_series BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'series:' || old.id;
END;
`;
