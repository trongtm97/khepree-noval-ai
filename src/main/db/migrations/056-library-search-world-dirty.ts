/** Extra dirty triggers: world, style rules, volumes, glossary translations, aliases. */
export const MIGRATION_056_LIBRARY_SEARCH_WORLD_DIRTY = `
-- Series world knowledge → searchable 'world' entity (entity_id = series_id)
CREATE TRIGGER IF NOT EXISTS series_world_lib_search_dirty_ai AFTER INSERT ON series_world_states BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('world', new.series_id, NULL, datetime('now'));
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.series_id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS series_world_lib_search_dirty_au AFTER UPDATE ON series_world_states BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('world', new.series_id, NULL, datetime('now'));
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.series_id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS series_world_lib_search_fts_ad AFTER DELETE ON series_world_states BEGIN
  DELETE FROM library_search_fts WHERE entity_key = 'world:' || old.series_id;
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', old.series_id, NULL, datetime('now'));
END;

-- Style rules affect series body / world conventions search
CREATE TRIGGER IF NOT EXISTS series_style_lib_search_dirty_ai AFTER INSERT ON series_style_rules BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.series_id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS series_style_lib_search_dirty_au AFTER UPDATE ON series_style_rules BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.series_id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS series_style_lib_search_dirty_ad AFTER DELETE ON series_style_rules BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', old.series_id, NULL, datetime('now'));
END;

-- Volume membership changes project↔series index meta
CREATE TRIGGER IF NOT EXISTS series_volumes_lib_search_dirty_ai AFTER INSERT ON fiction_series_volumes BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.series_id, NULL, datetime('now'));
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('project', new.project_id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS series_volumes_lib_search_dirty_au AFTER UPDATE ON fiction_series_volumes BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', new.series_id, NULL, datetime('now'));
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('project', new.project_id, new.project_id, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS series_volumes_lib_search_dirty_ad AFTER DELETE ON fiction_series_volumes BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('series', old.series_id, NULL, datetime('now'));
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('project', old.project_id, old.project_id, datetime('now'));
END;

-- Glossary preferred translation edits (term_translations does not UPDATE terms row)
CREATE TRIGGER IF NOT EXISTS term_translations_lib_search_dirty_ai AFTER INSERT ON term_translations BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('term', new.term_id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS term_translations_lib_search_dirty_au AFTER UPDATE ON term_translations BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('term', new.term_id, NULL, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS term_translations_lib_search_dirty_ad AFTER DELETE ON term_translations BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  VALUES ('term', old.term_id, NULL, datetime('now'));
END;

-- Character alias edits
CREATE TRIGGER IF NOT EXISTS character_aliases_lib_search_dirty_ai AFTER INSERT ON character_aliases BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  SELECT 'character', new.character_id, c.project_id, datetime('now')
  FROM characters c WHERE c.id = new.character_id;
END;

CREATE TRIGGER IF NOT EXISTS character_aliases_lib_search_dirty_au AFTER UPDATE ON character_aliases BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  SELECT 'character', new.character_id, c.project_id, datetime('now')
  FROM characters c WHERE c.id = new.character_id;
END;

CREATE TRIGGER IF NOT EXISTS character_aliases_lib_search_dirty_ad AFTER DELETE ON character_aliases BEGIN
  INSERT OR IGNORE INTO library_search_dirty (entity_type, entity_id, project_id, created_at)
  SELECT 'character', old.character_id, c.project_id, datetime('now')
  FROM characters c WHERE c.id = old.character_id;
END;
`;
