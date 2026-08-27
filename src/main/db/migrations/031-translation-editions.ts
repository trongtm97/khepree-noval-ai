import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

/**
 * Translation Editions — one target-language translation per project.
 * Project stays source corpus; legacy projects get one edition from current target_language.
 * Research Notebook / FULL preprocess stay project-scoped (not duplicated per edition).
 */
export const MIGRATION_031_TRANSLATION_EDITIONS = `
CREATE TABLE IF NOT EXISTS translation_editions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  style_config TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, target_language)
);

CREATE INDEX IF NOT EXISTS idx_translation_editions_project
  ON translation_editions(project_id, status);

ALTER TABLE projects ADD COLUMN active_edition_id TEXT REFERENCES translation_editions(id) ON DELETE SET NULL;

ALTER TABLE translations ADD COLUMN edition_id TEXT REFERENCES translation_editions(id) ON DELETE CASCADE;
ALTER TABLE jobs ADD COLUMN edition_id TEXT REFERENCES translation_editions(id) ON DELETE SET NULL;
ALTER TABLE notebook_resources ADD COLUMN edition_id TEXT REFERENCES translation_editions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_paragraph_edition
  ON translations(paragraph_id, edition_id)
  WHERE edition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_translations_edition
  ON translations(edition_id);

CREATE INDEX IF NOT EXISTS idx_jobs_edition
  ON jobs(edition_id);

DROP INDEX IF EXISTS idx_notebook_project_worker_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_project_worker_role
  ON notebook_resources(project_id, google_account_id, notebook_role)
  WHERE google_account_id IS NOT NULL AND edition_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_project_worker_role_edition
  ON notebook_resources(project_id, google_account_id, notebook_role, edition_id)
  WHERE google_account_id IS NOT NULL AND edition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notebook_resources_edition
  ON notebook_resources(edition_id);
`;

function utcNow(): string {
  return new Date().toISOString();
}

function editionDisplayName(targetLanguage: string): string {
  const code = (targetLanguage || 'vi').trim() || 'vi';
  const map: Record<string, string> = {
    vi: 'Tiếng Việt',
    en: 'English',
    'en-US': 'English',
    'en-GB': 'English',
    es: 'Español',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    de: 'Deutsch',
  };
  return map[code] ?? code;
}

/** Backfill one legacy edition per project; attach existing translation/job/notebook rows. */
export function runMigration031Backfill(db: Database.Database): void {
  const now = utcNow();
  const projects = db
    .prepare(
      `SELECT p.id, p.target_language, p.target_title, ps.style_config
       FROM projects p
       LEFT JOIN project_settings ps ON ps.project_id = p.id
       WHERE p.deleted_at IS NULL`,
    )
    .all() as {
    id: string;
    target_language: string;
    target_title: string | null;
    style_config: string | null;
  }[];

  const insertEdition = db.prepare(
    `INSERT INTO translation_editions (
      id, project_id, target_language, name, status, style_config, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
  );
  const setActive = db.prepare(
    `UPDATE projects SET active_edition_id = ?, updated_at = ? WHERE id = ?`,
  );

  for (const project of projects) {
    const existing = db
      .prepare(
        `SELECT id FROM translation_editions WHERE project_id = ? AND target_language = ?`,
      )
      .get(project.id, project.target_language) as { id: string } | undefined;
    if (existing) {
      setActive.run(existing.id, now, project.id);
      continue;
    }

    const editionId = randomUUID();
    const name =
      (project.target_title && project.target_title.trim()) ||
      editionDisplayName(project.target_language);

    insertEdition.run(
      editionId,
      project.id,
      project.target_language || 'vi',
      name,
      project.style_config,
      now,
      now,
    );
    setActive.run(editionId, now, project.id);

    db.prepare(
      `UPDATE translations SET edition_id = ?
       WHERE edition_id IS NULL
         AND paragraph_id IN (
           SELECT p.id FROM chapter_paragraphs p
           INNER JOIN chapters c ON c.id = p.chapter_id
           WHERE c.project_id = ?
         )`,
    ).run(editionId, project.id);

    db.prepare(
      `UPDATE jobs SET edition_id = ? WHERE project_id = ? AND edition_id IS NULL`,
    ).run(editionId, project.id);

    db.prepare(
      `UPDATE notebook_resources SET edition_id = ?
       WHERE project_id = ?
         AND edition_id IS NULL
         AND notebook_role IN ('TRANSLATION', 'SINGLE')`,
    ).run(editionId, project.id);

    db.prepare(
      `UPDATE translation_waves SET edition_id = ?
       WHERE project_id = ? AND (edition_id IS NULL OR edition_id = '')`,
    ).run(editionId, project.id);
  }
}
