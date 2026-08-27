import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NOVELTRANS_APPDATA_DIR, DB_FILENAME } from '@shared/constants/db';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import { withTransaction } from '@main/db/transaction';
import { getCurrentSchemaVersion, runMigrations } from '@main/db/migration-runner';
import { MIGRATIONS, migrationChecksum } from '@main/db/migrations';
import { backupDatabaseFile, restoreDatabaseFromBackup } from '@main/db/backup';

describe('resolveAppPaths', () => {
  it('places database under AppData/NovelTrans/data/', () => {
    const appData = path.join(os.tmpdir(), 'appdata-test');
    const paths = resolveAppPaths(appData);
    expect(paths.root).toBe(path.join(appData, NOVELTRANS_APPDATA_DIR));
    expect(path.join(paths.data, DB_FILENAME)).toContain('NovelTrans');
    expect(path.join(paths.data, DB_FILENAME)).toContain('data');
  });
});

describe('DatabaseManager', () => {
  let tempRoot: string;
  let dataDir: string;
  let backupsDir: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-db-'));
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates database file and applies all migrations', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const dbPath = path.join(dataDir, DB_FILENAME);

    expect(fs.existsSync(dbPath)).toBe(true);
    expect(db.getSchemaVersion()).toBe(29);

    const tables = db
      .getConnection()
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('terms');
    expect(tableNames).toContain('secrets');
    expect(tableNames).toContain('audit_events');
    expect(tableNames).toContain('terms_fts');
    expect(tableNames).toContain('characters_fts');
    expect(tableNames).toContain('chapters_fts');

    db.close();
  });

  it('supports insert, update, delete via repositories', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });

    const project = db.projects.create({ title: 'Test Novel', genre: 'xianxia' });
    expect(project.id).toBeTruthy();
    expect(project.title).toBe('Test Novel');

    const updated = db.projects.update(project.id, { title: 'Updated Novel' });
    expect(updated?.title).toBe('Updated Novel');

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Chapter One',
      source_text: '这是第一章的内容。',
    });

    const paragraph = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '段落一',
    });

    const translation = db.translations.create({
      paragraph_id: paragraph.id,
      translated_text: 'Đoạn một',
      provider: 'gemini',
      model: 'web',
      status: 'translated',
    });
    expect(translation.translated_text).toBe('Đoạn một');

    const term = db.terms.create({
      source_simplified: '灵气',
      pinyin: 'líng qì',
      scope: 'PROJECT',
      scope_ref: project.id,
      target_text: 'linh khí',
      status: 'CANDIDATE',
    });
    expect(term.source_simplified).toBe('灵气');
    expect(db.terms.getPrimaryTranslation(term.id)).toBe('linh khí');

    const character = db.characters.create({
      project_id: project.id,
      canonical_name: '李逍遥',
      translated_name: 'Lý Tiêu Dao',
    });
    expect(character.canonical_name).toBe('李逍遥');

    expect(db.projects.softDelete(project.id)).toBe(true);
    expect(db.projects.getById(project.id)).toBeNull();

    db.close();
  });

  it('rolls back failed transaction', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    const project = db.projects.create({ title: 'Rollback Test' });

    expect(() => {
      withTransaction(db.getConnection(), () => {
        db.projects.update(project.id, { title: 'Should Not Persist' });
        throw new Error('forced rollback');
      });
    }).toThrow('forced rollback');

    expect(db.projects.getById(project.id)?.title).toBe('Rollback Test');
    db.close();
  });

  it('supports FTS search on terms, characters, and chapters', () => {
    const db = createDatabaseManager({ dataDir, backupsDir });
    try {
      const project = db.projects.create({ title: 'FTS Novel' });

      db.terms.create({
        source_simplified: '灵气',
        pinyin: 'lingqi',
        scope: 'GLOBAL',
        target_text: 'linh khi',
      });

      db.characters.create({
        project_id: project.id,
        canonical_name: '李逍遥',
        translated_name: 'Ly Tieu Dao',
        description: 'protagonist',
      });

      db.chapters.create({
        project_id: project.id,
        chapter_number: 1,
        sequence_order: 1,
        chapter_title: 'Beginning Cultivation',
        source_text: '修仙之路',
      });

      expect(db.terms.searchFts('灵气').length).toBeGreaterThan(0);
      expect(db.characters.searchFts('李逍遥').length).toBeGreaterThan(0);
      expect(db.chapters.searchFts('Cultivation').length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('persists data after close and reopen', () => {
    let projectId: string;

    {
      const db = createDatabaseManager({ dataDir, backupsDir });
      const project = db.projects.create({ title: 'Persistent Novel' });
      projectId = project.id;
      db.close();
    }

    {
      const db = createDatabaseManager({ dataDir, backupsDir });
      const project = db.projects.getById(projectId);
      expect(project?.title).toBe('Persistent Novel');
      expect(db.getSchemaVersion()).toBe(29);
      db.close();
    }
  });

  it('creates backup before applying pending migration on existing database', () => {
    const dbPath = path.join(dataDir, DB_FILENAME);
    const rawDb = new Database(dbPath);
    rawDb.exec(MIGRATIONS[0].sql);
    rawDb
      .prepare(
        `INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (1, 'initial_schema', ?, ?)`,
      )
      .run(new Date().toISOString(), migrationChecksum(MIGRATIONS[0].sql));
    rawDb.close();

    const pending = MIGRATIONS.map((m: (typeof MIGRATIONS)[number]) => ({
      ...m,
      checksum: migrationChecksum(m.sql),
    }));

    const db = new Database(dbPath);
    const beforeBackups = fs.readdirSync(backupsDir).length;

    runMigrations(db, pending.slice(1), { dbPath, backupsDir });

    const afterBackups = fs.readdirSync(backupsDir).length;
    expect(getCurrentSchemaVersion(db)).toBe(29);
    expect(afterBackups).toBeGreaterThanOrEqual(beforeBackups);

    db.close();
  });

  it('restores from backup when migration fails', () => {
    const dbPath = path.join(dataDir, DB_FILENAME);
    const rawDb = new Database(dbPath);
    rawDb.exec(MIGRATIONS[0].sql);
    rawDb
      .prepare(
        `INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (1, 'initial_schema', ?, ?)`,
      )
      .run(new Date().toISOString(), migrationChecksum(MIGRATIONS[0].sql));
    rawDb.close();

    const backupPath = backupDatabaseFile(dbPath, backupsDir);

    const badMigration = {
      version: 2,
      name: 'bad',
      sql: `CREATE TABLE IF NOT EXISTS bad_table (id TEXT); INVALID SQL SYNTAX HERE;`,
      checksum: 'bad',
    };

    const db = new Database(dbPath);
    expect(() => {
      runMigrations(db, [badMigration], { dbPath, backupsDir });
    }).toThrow();

    db.close();

    const restored = new Database(dbPath);
    expect(getCurrentSchemaVersion(restored)).toBe(1);
    restored.close();

    restoreDatabaseFromBackup(dbPath, backupPath);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });
});
