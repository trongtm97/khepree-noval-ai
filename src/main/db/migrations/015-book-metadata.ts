export const MIGRATION_015_BOOK_METADATA = `
-- Project metadata columns
ALTER TABLE projects ADD COLUMN title_cn TEXT;
ALTER TABLE projects ADD COLUMN title_vi TEXT;
ALTER TABLE projects ADD COLUMN title_original TEXT;
ALTER TABLE projects ADD COLUMN alternative_titles TEXT;
ALTER TABLE projects ADD COLUMN author_name TEXT;
ALTER TABLE projects ADD COLUMN author_name_cn TEXT;
ALTER TABLE projects ADD COLUMN subgenres TEXT;
ALTER TABLE projects ADD COLUMN publication_status TEXT;
ALTER TABLE projects ADD COLUMN expected_chapter_count INTEGER;
ALTER TABLE projects ADD COLUMN introduction TEXT;
ALTER TABLE projects ADD COLUMN official_summary TEXT;
ALTER TABLE projects ADD COLUMN notes TEXT;
ALTER TABLE projects ADD COLUMN cover_path TEXT;
ALTER TABLE projects ADD COLUMN metadata_source TEXT;
ALTER TABLE projects ADD COLUMN metadata_updated_at TEXT;
ALTER TABLE projects ADD COLUMN book_profile_dirty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN metadata_fields TEXT;

CREATE TABLE IF NOT EXISTS project_documents (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type        TEXT NOT NULL,
  title                TEXT,
  source_file_path     TEXT,
  source_file_name     TEXT,
  source_text          TEXT,
  content_hash         TEXT,
  source_modified_at   TEXT,
  classification       TEXT NOT NULL DEFAULT 'PROJECT_DOCUMENT',
  status               TEXT NOT NULL DEFAULT 'active',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project
  ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type
  ON project_documents(project_id, document_type);

-- Rebuild chapters for nullable chapter_number + sequence_order + chapter_type
DROP TRIGGER IF EXISTS chapters_fts_ai;
DROP TRIGGER IF EXISTS chapters_fts_ad;
DROP TRIGGER IF EXISTS chapters_fts_au;

CREATE TABLE chapters_new (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_number         INTEGER,
  chapter_type           TEXT NOT NULL DEFAULT 'NORMAL',
  sequence_order         INTEGER NOT NULL,
  display_title          TEXT,
  chapter_title          TEXT,
  source_text            TEXT,
  source_hash            TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending',
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  source_file_path       TEXT,
  source_file_name       TEXT,
  source_file_size       INTEGER,
  source_file_modified_at TEXT,
  source_file_hash       TEXT,
  source_content_hash    TEXT,
  source_status          TEXT NOT NULL DEFAULT 'NO_SOURCE',
  source_encoding        TEXT,
  last_source_scan_at    TEXT,
  UNIQUE (project_id, sequence_order)
);

INSERT INTO chapters_new (
  id, project_id, chapter_number, chapter_type, sequence_order, display_title,
  chapter_title, source_text, source_hash, status, created_at, updated_at,
  source_file_path, source_file_name, source_file_size, source_file_modified_at,
  source_file_hash, source_content_hash, source_status, source_encoding, last_source_scan_at
)
SELECT
  id, project_id, chapter_number, 'NORMAL', chapter_number, NULL,
  chapter_title, source_text, source_hash, status, created_at, updated_at,
  source_file_path, source_file_name, source_file_size, source_file_modified_at,
  source_file_hash, source_content_hash, source_status, source_encoding, last_source_scan_at
FROM chapters;

DROP TABLE chapters;
ALTER TABLE chapters_new RENAME TO chapters;

CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(project_id, status);
CREATE INDEX IF NOT EXISTS idx_chapters_project_number ON chapters(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_chapters_project_sequence ON chapters(project_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_chapters_project_source_status
  ON chapters(project_id, source_status);

CREATE TRIGGER chapters_fts_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO chapters_fts(chapter_id, chapter_title, source_text)
  VALUES (new.id, COALESCE(new.chapter_title, ''), COALESCE(new.source_text, ''));
END;

CREATE TRIGGER chapters_fts_ad AFTER DELETE ON chapters BEGIN
  DELETE FROM chapters_fts WHERE chapter_id = old.id;
END;

CREATE TRIGGER chapters_fts_au AFTER UPDATE ON chapters BEGIN
  DELETE FROM chapters_fts WHERE chapter_id = old.id;
  INSERT INTO chapters_fts(chapter_id, chapter_title, source_text)
  VALUES (new.id, COALESCE(new.chapter_title, ''), COALESCE(new.source_text, ''));
END;
`;
