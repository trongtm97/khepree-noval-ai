export const MIGRATION_014_SOURCE_FOLDER = `
ALTER TABLE projects ADD COLUMN source_mode TEXT NOT NULL DEFAULT 'LEGACY_IMPORT';
ALTER TABLE projects ADD COLUMN source_folder_path TEXT;
ALTER TABLE projects ADD COLUMN source_folder_status TEXT;
ALTER TABLE projects ADD COLUMN watch_folder_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN scan_on_startup INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN auto_import_new_chapters INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN auto_queue_new_chapters INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN auto_translate_new_chapters INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN expected_start_chapter INTEGER;
ALTER TABLE projects ADD COLUMN expected_end_chapter INTEGER;
ALTER TABLE projects ADD COLUMN last_folder_scan_at TEXT;

ALTER TABLE chapters ADD COLUMN source_file_path TEXT;
ALTER TABLE chapters ADD COLUMN source_file_name TEXT;
ALTER TABLE chapters ADD COLUMN source_file_size INTEGER;
ALTER TABLE chapters ADD COLUMN source_file_modified_at TEXT;
ALTER TABLE chapters ADD COLUMN source_file_hash TEXT;
ALTER TABLE chapters ADD COLUMN source_content_hash TEXT;
ALTER TABLE chapters ADD COLUMN source_status TEXT NOT NULL DEFAULT 'NO_SOURCE';
ALTER TABLE chapters ADD COLUMN source_encoding TEXT;
ALTER TABLE chapters ADD COLUMN last_source_scan_at TEXT;

UPDATE chapters SET source_status = 'SOURCE_READY'
WHERE source_text IS NOT NULL AND source_status = 'NO_SOURCE';

CREATE INDEX IF NOT EXISTS idx_chapters_project_source_status
  ON chapters(project_id, source_status);
`;
