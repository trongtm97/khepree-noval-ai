export const MIGRATION_002_INDEXES_FTS = `
-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);

CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(project_id, status);

CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON chapter_paragraphs(chapter_id);
CREATE INDEX IF NOT EXISTS idx_paragraphs_stable_id ON chapter_paragraphs(paragraph_id);

CREATE INDEX IF NOT EXISTS idx_translations_paragraph ON translations(paragraph_id);
CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(status);

CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_character_aliases_character ON character_aliases(character_id);
CREATE INDEX IF NOT EXISTS idx_character_relationships_project ON character_relationships(project_id);

CREATE INDEX IF NOT EXISTS idx_terms_scope ON terms(scope, scope_ref);
CREATE INDEX IF NOT EXISTS idx_terms_status ON terms(status);
CREATE INDEX IF NOT EXISTS idx_terms_source ON terms(source_simplified);
CREATE INDEX IF NOT EXISTS idx_terms_genre ON terms(genre);
CREATE INDEX IF NOT EXISTS idx_term_translations_term ON term_translations(term_id);
CREATE INDEX IF NOT EXISTS idx_term_occurrences_term ON term_occurrences(term_id);
CREATE INDEX IF NOT EXISTS idx_term_occurrences_project ON term_occurrences(project_id);
CREATE INDEX IF NOT EXISTS idx_project_terms_project ON project_terms(project_id);

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_job_attempts_job ON job_attempts(job_id);

CREATE INDEX IF NOT EXISTS idx_google_profiles_account ON google_browser_profiles(google_account_id);
CREATE INDEX IF NOT EXISTS idx_oauth_account ON google_oauth_credentials(google_account_id);

CREATE INDEX IF NOT EXISTS idx_memory_events_project ON memory_events(project_id);
CREATE INDEX IF NOT EXISTS idx_automation_events_job ON automation_events(job_id);
CREATE INDEX IF NOT EXISTS idx_drive_resources_project ON drive_resources(project_id);

-- FTS5: terms
CREATE VIRTUAL TABLE IF NOT EXISTS terms_fts USING fts5(
  term_id UNINDEXED,
  source_simplified,
  source_traditional,
  pinyin,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS terms_fts_ai AFTER INSERT ON terms BEGIN
  INSERT INTO terms_fts(term_id, source_simplified, source_traditional, pinyin)
  VALUES (new.id, new.source_simplified, COALESCE(new.source_traditional, ''), COALESCE(new.pinyin, ''));
END;

CREATE TRIGGER IF NOT EXISTS terms_fts_ad AFTER DELETE ON terms BEGIN
  DELETE FROM terms_fts WHERE term_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS terms_fts_au AFTER UPDATE ON terms BEGIN
  DELETE FROM terms_fts WHERE term_id = old.id;
  INSERT INTO terms_fts(term_id, source_simplified, source_traditional, pinyin)
  VALUES (new.id, new.source_simplified, COALESCE(new.source_traditional, ''), COALESCE(new.pinyin, ''));
END;

-- FTS5: characters
CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts5(
  character_id UNINDEXED,
  canonical_name,
  translated_name,
  description,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS characters_fts_ai AFTER INSERT ON characters BEGIN
  INSERT INTO characters_fts(character_id, canonical_name, translated_name, description)
  VALUES (new.id, new.canonical_name, COALESCE(new.translated_name, ''), COALESCE(new.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS characters_fts_ad AFTER DELETE ON characters BEGIN
  DELETE FROM characters_fts WHERE character_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS characters_fts_au AFTER UPDATE ON characters BEGIN
  DELETE FROM characters_fts WHERE character_id = old.id;
  INSERT INTO characters_fts(character_id, canonical_name, translated_name, description)
  VALUES (new.id, new.canonical_name, COALESCE(new.translated_name, ''), COALESCE(new.description, ''));
END;

-- FTS5: chapter full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS chapters_fts USING fts5(
  chapter_id UNINDEXED,
  chapter_title,
  source_text,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS chapters_fts_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO chapters_fts(chapter_id, chapter_title, source_text)
  VALUES (new.id, COALESCE(new.chapter_title, ''), COALESCE(new.source_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS chapters_fts_ad AFTER DELETE ON chapters BEGIN
  DELETE FROM chapters_fts WHERE chapter_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS chapters_fts_au AFTER UPDATE ON chapters BEGIN
  DELETE FROM chapters_fts WHERE chapter_id = old.id;
  INSERT INTO chapters_fts(chapter_id, chapter_title, source_text)
  VALUES (new.id, COALESCE(new.chapter_title, ''), COALESCE(new.source_text, ''));
END;
`;
