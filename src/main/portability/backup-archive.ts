import { DB_FILENAME } from '@shared/constants/app';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import {
  PORTABILITY_FORMAT_VERSION,
  PORTABILITY_MAX_SCHEMA_VERSION,
  type BackupKind,
} from '@shared/constants/portability';
import type { BackupManifest } from '@shared/schemas/portability';
import { BackupManifestSchema } from '@shared/schemas/portability';
import type { DatabaseManager } from '../db/database-manager';
import { atomicBackupDatabase, restoreDatabaseFromBackup } from '../db/backup';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';

const MANIFEST_NAME = 'manifest.json';
const DB_ENTRY = DB_FILENAME;
const SETTINGS_ENTRY = 'app-settings.json';
const TERMS_ENTRY = 'terms-vault.json';
const AUTOMATION_ENTRY = 'automation-config.json';
const PROJECT_ENTRY = 'project-bundle.json';

const SECRET_META_PREFIX = 'secret.';

export interface CreateArchiveInput {
  kind: BackupKind;
  db: DatabaseManager;
  dbPath: string;
  backupsDir: string;
  outputPath?: string;
  projectId?: string;
  includeCredentials?: boolean;
}

export interface CreateArchiveResult {
  filePath: string;
  manifest: BackupManifest;
}

interface ProjectBundle {
  project: {
    id: string;
    title: string;
    source_language: string;
    target_language: string;
    genre: string | null;
    description: string | null;
    status: string;
  };
  settings: { style_config: string | null; import_config: string | null } | null;
  editions: Record<string, unknown>[];
  chapters: Record<string, unknown>[];
  paragraphs: Record<string, unknown>[];
  translations: Record<string, unknown>[];
  translationVersions: Record<string, unknown>[];
  terms: Record<string, unknown>[];
  characters: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  storyState: Record<string, unknown> | null;
  memoryEvents: Record<string, unknown>[];
}

export function buildManifest(
  kind: BackupKind,
  schemaVersion: number,
  projectId: string | null,
  projectTitle: string | null,
  includeCredentials: boolean,
): BackupManifest {
  return {
    formatVersion: PORTABILITY_FORMAT_VERSION,
    kind,
    appVersion: readAppVersion(),
    schemaVersion,
    exportedAt: new Date().toISOString(),
    projectId,
    projectTitle,
    includesCredentials: includeCredentials,
    includesBrowserProfiles: false,
  };
}

export async function createBackupArchive(input: CreateArchiveInput): Promise<CreateArchiveResult> {
  const includeCredentials = input.includeCredentials ?? false;
  const schemaVersion = input.db.getSchemaVersion();
  const zip = new JSZip();
  let manifest: BackupManifest;

  if (input.kind === 'full') {
    manifest = buildManifest('full', schemaVersion, null, null, includeCredentials);
    input.db.getConnection().pragma('wal_checkpoint(FULL)');
    const sanitizedDbPath = createSanitizedDbCopy(
      input.dbPath,
      input.backupsDir,
      includeCredentials,
    );
    try {
      zip.file(DB_ENTRY, fs.readFileSync(sanitizedDbPath));
      zip.file(SETTINGS_ENTRY, JSON.stringify(collectAppSettings(input.db), null, 2));
      zip.file(TERMS_ENTRY, JSON.stringify(exportTermVaultSnapshot(input.db), null, 2));
      zip.file(AUTOMATION_ENTRY, JSON.stringify(collectAutomationConfig(input.db), null, 2));
    } finally {
      if (fs.existsSync(sanitizedDbPath)) fs.unlinkSync(sanitizedDbPath);
    }
  } else {
    if (!input.projectId) throw new Error('projectId required for project backup');
    const project = input.db.projects.getById(input.projectId);
    if (!project) throw new Error('Project not found');
    manifest = buildManifest('project', schemaVersion, project.id, project.title, false);
    zip.file(PROJECT_ENTRY, JSON.stringify(exportProjectBundle(input.db, input.projectId), null, 2));
  }

  zip.file(MANIFEST_NAME, JSON.stringify(manifest, null, 2));

  const defaultName =
    input.kind === 'full'
      ? `khepree-novel-ai-full-${timestamp()}.nts-backup.zip`
      : `khepree-novel-ai-project-${sanitizeFileName(manifest.projectTitle ?? 'project')}-${timestamp()}.nts-project.zip`;

  const outputPath = input.outputPath ?? path.join(input.backupsDir, defaultName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, buffer);

  return { filePath: outputPath, manifest };
}

export async function readZipEntryAsync(archivePath: string, name: string): Promise<Buffer | null> {
  const buffer = fs.readFileSync(archivePath);
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(name);
  if (!entry) return null;
  return entry.async('nodebuffer');
}

export async function previewBackupArchiveAsync(
  archivePath: string,
  dbPath: string,
): Promise<{
  manifest: BackupManifest;
  compatible: boolean;
  warnings: string[];
  requiresOverwrite: boolean;
  summary: {
    projectTitle: string | null;
    sourceLanguage: string | null;
    targetLanguage: string | null;
    chapterCount: number | null;
    translationCount: number | null;
    backupDate: string;
  };
}> {
  const manifestRaw = await readZipEntryAsync(archivePath, MANIFEST_NAME);
  if (!manifestRaw) throw new Error('Invalid archive: missing manifest.json');
  const manifest = BackupManifestSchema.parse(JSON.parse(manifestRaw.toString('utf8')));

  const warnings: string[] = [];
  let compatible = true;
  if (manifest.formatVersion > PORTABILITY_FORMAT_VERSION) {
    compatible = false;
    warnings.push(`Archive format v${manifest.formatVersion} is newer than app supports`);
  }
  if (manifest.schemaVersion > PORTABILITY_MAX_SCHEMA_VERSION) {
    compatible = false;
    warnings.push(
      `Archive schema v${manifest.schemaVersion} is newer than app max ${PORTABILITY_MAX_SCHEMA_VERSION}`,
    );
  }

  const requiresOverwrite =
    manifest.kind === 'full'
      ? fs.existsSync(dbPath)
      : manifest.projectId != null &&
        fs.existsSync(dbPath) &&
        dbHasProject(dbPath, manifest.projectId);

  if (manifest.includesCredentials) {
    warnings.push('Archive includes encrypted credentials');
  }

  const summary = await buildRestorePreviewSummary(archivePath, manifest);

  return { manifest, compatible, warnings, requiresOverwrite, summary };
}

export async function restoreBackupArchiveAsync(input: {
  archivePath: string;
  dbPath: string;
  backupsDir: string;
  confirmOverwrite: boolean;
  db: DatabaseManager;
}): Promise<{ message: string; requiresRestart: boolean }> {
  const preview = await previewBackupArchiveAsync(input.archivePath, input.dbPath);
  if (!preview.compatible) {
    throw new Error(`Incompatible archive: ${preview.warnings.join('; ')}`);
  }
  if (preview.requiresOverwrite && !input.confirmOverwrite) {
    throw new Error('Restore requires confirmOverwrite — existing data would be replaced');
  }

  if (preview.manifest.kind === 'full') {
    const dbBuffer = await readZipEntryAsync(input.archivePath, DB_ENTRY);
    if (!dbBuffer) throw new Error('Archive missing database file');

    if (fs.existsSync(input.dbPath)) {
      const safety = path.join(input.backupsDir, `pre-restore-${timestamp()}.db`);
      atomicBackupDatabase(input.dbPath, safety);
    }

    input.db.close();
    // Replace DB file and drop stale WAL/SHM so SQLite does not replay old journal.
    for (const suffix of ['-wal', '-shm'] as const) {
      const side = `${input.dbPath}${suffix}`;
      if (fs.existsSync(side)) {
        fs.unlinkSync(side);
      }
    }
    fs.writeFileSync(input.dbPath, dbBuffer);
    return {
      message: 'Full database restored. Restart app to reload.',
      requiresRestart: true,
    };
  }

  const bundleRaw = await readZipEntryAsync(input.archivePath, PROJECT_ENTRY);
  if (!bundleRaw) throw new Error('Archive missing project bundle');
  const bundle = JSON.parse(bundleRaw.toString('utf8')) as ProjectBundle;

  if (
    preview.manifest.projectId &&
    input.db.projects.getById(preview.manifest.projectId) &&
    !input.confirmOverwrite
  ) {
    throw new Error('Project already exists — confirmOverwrite required');
  }

  importProjectBundle(input.db, bundle, input.confirmOverwrite);
  return { message: `Project "${bundle.project.title}" restored`, requiresRestart: false };
}

function createSanitizedDbCopy(
  dbPath: string,
  backupsDir: string,
  includeCredentials: boolean,
): string {
  fs.mkdirSync(backupsDir, { recursive: true });
  const tempPath = path.join(backupsDir, `export-sanitize-${timestamp()}.db`);
  atomicBackupDatabase(dbPath, tempPath);

  if (!includeCredentials) {
    const tempDb = new Database(tempPath);
    try {
      const tables = tempDb
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('secrets', 'google_accounts')`)
        .all() as { name: string }[];
      for (const row of tables) {
        tempDb.exec(`DELETE FROM ${row.name}`);
      }
    } finally {
      tempDb.close();
    }
  }

  return tempPath;
}

function collectAppSettings(db: DatabaseManager): Record<string, string> {
  const rows = db
    .getConnection()
    .prepare(`SELECT key, value FROM app_meta`)
    .all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith(SECRET_META_PREFIX)) continue;
    if (row.key.startsWith('security.')) continue;
    out[row.key] = row.value;
  }
  return out;
}

function collectAutomationConfig(db: DatabaseManager): Record<string, string> {
  const rows = db
    .getConnection()
    .prepare(`SELECT key, value FROM app_meta WHERE key LIKE 'scheduler.%' OR key LIKE 'backup.%'`)
    .all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function exportTermVaultSnapshot(db: DatabaseManager): unknown[] {
  return db.terms.search({ limit: 50000 }).map((row) => ({
    id: row.id,
    source_simplified: row.source_simplified,
    scope: row.scope,
    scope_ref: row.scope_ref,
    status: row.status,
    term_type: row.term_type,
    preferred: db.terms.getPrimaryTranslation(row.id),
  }));
}

function exportProjectBundle(db: DatabaseManager, projectId: string): ProjectBundle {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error('Project not found');

  const settings = db
    .getConnection()
    .prepare(`SELECT style_config, import_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null; import_config: string | null } | undefined;

  const chapters = db.chapters.listByProject(projectId) as unknown as Record<string, unknown>[];
  const paragraphs: Record<string, unknown>[] = [];
  const translations: Record<string, unknown>[] = [];
  const translationVersions: Record<string, unknown>[] = [];

  for (const chapter of db.chapters.listByProject(projectId)) {
    for (const para of db.paragraphs.listByChapter(chapter.id)) {
      paragraphs.push(para as unknown as Record<string, unknown>);
      const tr = db.translations.getByParagraphId(para.id);
      if (tr) {
        translations.push(tr as unknown as Record<string, unknown>);
        for (const ver of db.translations.listVersions(tr.id)) {
          translationVersions.push(ver as unknown as Record<string, unknown>);
        }
      }
    }
  }

  return {
    project: {
      id: project.id,
      title: project.title,
      source_language: project.source_language,
      target_language: project.target_language,
      genre: project.genre,
      description: project.description,
      status: project.status,
    },
    settings: settings ?? null,
    editions: db.translationEditions.listByProject(projectId) as unknown as Record<
      string,
      unknown
    >[],
    chapters,
    paragraphs,
    translations,
    translationVersions,
    terms: db.terms.search({ projectId, limit: 50000 }) as unknown as Record<string, unknown>[],
    characters: db.characters.listByProject(projectId) as unknown as Record<string, unknown>[],
    relationships: db.relationships.listActiveAtChapter(
      projectId,
      999999,
    ) as unknown as Record<string, unknown>[],
    storyState: db.storyStates.getByProject(projectId) as Record<string, unknown> | null,
    memoryEvents: db.memoryEvents.listByProject(projectId) as unknown as Record<string, unknown>[],
  };
}

function importProjectBundle(db: DatabaseManager, bundle: ProjectBundle, overwrite: boolean): void {
  const conn = db.getConnection();
  const existing = db.projects.getById(bundle.project.id);
  if (existing && !overwrite) {
    throw new Error('Project exists and overwrite not confirmed');
  }

  conn.exec('BEGIN');
  try {
    if (existing && overwrite) {
      purgeProject(conn, bundle.project.id);
    }

    const now = utcNow();
    conn
      .prepare(
        `INSERT INTO projects (id, title, source_language, target_language, genre, description, status, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        bundle.project.id,
        bundle.project.title,
        bundle.project.source_language,
        bundle.project.target_language,
        bundle.project.genre,
        bundle.project.description,
        bundle.project.status,
        now,
        now,
      );

    if (bundle.settings) {
      conn
        .prepare(
          `INSERT OR REPLACE INTO project_settings (id, project_id, style_config, import_config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          bundle.project.id,
          bundle.settings.style_config,
          bundle.settings.import_config,
          now,
          now,
        );
    }

    insertRows(conn, 'chapters', bundle.chapters);
    insertRows(conn, 'chapter_paragraphs', bundle.paragraphs);
    insertRows(conn, 'translations', bundle.translations);
    insertRows(conn, 'translation_versions', bundle.translationVersions);
    insertRows(conn, 'terms', bundle.terms);
    insertRows(conn, 'characters', bundle.characters);
    insertRows(conn, 'relationships', bundle.relationships);
    if (bundle.editions.length) {
      insertRows(conn, 'translation_editions', bundle.editions);
    }
    if (bundle.memoryEvents.length) {
      insertRows(conn, 'memory_events', bundle.memoryEvents);
    }
    if (bundle.storyState) {
      insertRows(conn, 'story_states', [bundle.storyState]);
    }

    conn.exec('COMMIT');
  } catch (error) {
    conn.exec('ROLLBACK');
    logger.warn('Project restore failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function purgeProject(conn: Database.Database, projectId: string): void {
  conn.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
}

function insertRows(conn: Database.Database, table: string, rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const cols = Object.keys(row);
    if (cols.length === 0) continue;
    const placeholders = cols.map(() => '?').join(', ');
    conn
      .prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(...cols.map((c) => row[c]));
  }
}

function dbHasProject(dbPath: string, projectId: string): boolean {
  if (!fs.existsSync(dbPath)) return false;
  const tempDb = new Database(dbPath, { readonly: true });
  try {
    const row = tempDb
      .prepare(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`)
      .get(projectId);
    return row != null;
  } finally {
    tempDb.close();
  }
}

async function buildRestorePreviewSummary(
  archivePath: string,
  manifest: BackupManifest,
): Promise<{
  projectTitle: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  chapterCount: number | null;
  translationCount: number | null;
  backupDate: string;
}> {
  const base = {
    projectTitle: manifest.projectTitle,
    sourceLanguage: null as string | null,
    targetLanguage: null as string | null,
    chapterCount: null as number | null,
    translationCount: null as number | null,
    backupDate: manifest.exportedAt,
  };

  if (manifest.kind === 'project') {
    const bundleRaw = await readZipEntryAsync(archivePath, PROJECT_ENTRY);
    if (!bundleRaw) return base;
    const bundle = JSON.parse(bundleRaw.toString('utf8')) as ProjectBundle;
    return {
      projectTitle: bundle.project.title,
      sourceLanguage: bundle.project.source_language,
      targetLanguage: bundle.project.target_language,
      chapterCount: bundle.chapters.length,
      translationCount: bundle.translations.length,
      backupDate: manifest.exportedAt,
    };
  }

  const dbBuffer = await readZipEntryAsync(archivePath, DB_ENTRY);
  if (!dbBuffer) return base;

  const tempPath = path.join(
    path.dirname(archivePath),
    `preview-${timestamp()}.db`,
  );
  fs.writeFileSync(tempPath, dbBuffer);
  const tempDb = new Database(tempPath, { readonly: true });
  try {
    const project =
      manifest.projectId != null
        ? (tempDb
            .prepare(`SELECT title, source_language, target_language FROM projects WHERE id = ?`)
            .get(manifest.projectId) as
            | { title: string; source_language: string; target_language: string }
            | undefined)
        : (tempDb
            .prepare(
              `SELECT title, source_language, target_language FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`,
            )
            .get() as
            | { title: string; source_language: string; target_language: string }
            | undefined);

    const chapterRow = tempDb
      .prepare(`SELECT COUNT(*) AS c FROM chapters`)
      .get() as { c: number };
    const translationRow = tempDb
      .prepare(`SELECT COUNT(*) AS c FROM translations`)
      .get() as { c: number };

    return {
      projectTitle: project?.title ?? manifest.projectTitle,
      sourceLanguage: project?.source_language ?? null,
      targetLanguage: project?.target_language ?? null,
      chapterCount: chapterRow.c,
      translationCount: translationRow.c,
      backupDate: manifest.exportedAt,
    };
  } finally {
    tempDb.close();
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 48);
}

function readAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app: electronApp } = require('electron') as typeof import('electron');
    return electronApp.getVersion();
  } catch {
    return '0.1.0';
  }
}

export function restoreDbFile(dbPath: string, backupPath: string): void {
  restoreDatabaseFromBackup(dbPath, backupPath);
}
