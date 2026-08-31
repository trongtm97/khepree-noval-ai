import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { initializeDatabase, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import {
  createBackupArchive,
  previewBackupArchiveAsync,
  restoreBackupArchiveAsync,
} from '@main/portability/backup-archive';
import {
  loadNovelExportData,
  renderNovelPlainText,
} from '@main/portability/novel-export-builder';
import { getAutoBackupConfig, runAutoBackupIfDue } from '@main/portability/auto-backup';
import { TermService } from '@main/services/term-service';
import { ensureDefaultEdition } from '@main/services/edition-service';

describe('Portability (Phase 18)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let dataDir: string;
  let backupsDir: string;
  let projectId: string;
  let dbPath: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-port-'));
    const paths = resolveAppPaths(tempRoot);
    dataDir = paths.data;
    backupsDir = paths.backups;
    closeDatabase();
    db = initializeDatabase({ dataDir, backupsDir });
    dbPath = db.dbPath;
    projectId = db.projects.create({ title: 'Portable Novel' }).id;
    const edition = ensureDefaultEdition(db, projectId);
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Opening',
      source_text: '你好世界。',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '你好世界。',
    });
    db.translations.create({
      paragraph_id: para.id,
      edition_id: edition.id,
      translated_text: 'Xin chào thế giới.',
      status: 'translated',
      version_source: 'AI_INITIAL',
    });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('exports novel TXT without paragraph IDs by default', () => {
    const data = loadNovelExportData(db, {
      projectId,
      translatedOnly: true,
    });
    const text = renderNovelPlainText(data, {
      includeChapterTitles: true,
      includeParagraphIds: false,
      useTranslation: true,
    });
    expect(text).toContain('Chương 1: Opening');
    expect(text).toContain('Xin chào thế giới.');
    expect(text).not.toContain('[C000001:P000001]');
  });

  it('full backup → delete DB → restore → verify equality', async () => {
    const titleBefore = db.projects.getById(projectId)?.title;
    expect(titleBefore).toBe('Portable Novel');

    const archive = await createBackupArchive({
      kind: 'full',
      db,
      dbPath,
      backupsDir,
      includeCredentials: false,
    });

    const preview = await previewBackupArchiveAsync(archive.filePath, dbPath);
    expect(preview.compatible).toBe(true);

    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${dbPath}${suffix}`;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    db = initializeDatabase({ dataDir, backupsDir });
    expect(db.projects.list()).toHaveLength(0);

    const restored = await restoreBackupArchiveAsync({
      archivePath: archive.filePath,
      dbPath,
      backupsDir,
      confirmOverwrite: true,
      db,
    });
    expect(restored.requiresRestart).toBe(true);

    db.close();
    db = initializeDatabase({ dataDir, backupsDir });
    const project = db.projects.getById(projectId);
    expect(project?.title).toBe('Portable Novel');
    const chapters = db.chapters.listByProject(projectId);
    expect(chapters.length).toBeGreaterThan(0);
    expect(db.translations.listByChapter(chapters[0].id)).toHaveLength(1);
  }, 30_000);

  it('restore rejects silent overwrite', async () => {
    const archive = await createBackupArchive({
      kind: 'full',
      db,
      dbPath,
      backupsDir,
    });
    await expect(
      restoreBackupArchiveAsync({
        archivePath: archive.filePath,
        dbPath,
        backupsDir,
        confirmOverwrite: false,
        db,
      }),
    ).rejects.toThrow(/confirmOverwrite/i);
  });

  it('auto backup runs ZIP archives and respects tiered retention', async () => {
    db.appMeta.set('backup.auto.enabled', 'true');
    db.appMeta.set('backup.auto.intervalHours', '24');
    db.appMeta.set('backup.auto.retentionDaily', '2');
    db.appMeta.set('backup.auto.retentionWeekly', '1');
    db.appMeta.set('backup.auto.retentionMonthly', '1');
    db.appMeta.set('backup.auto.lastRunAt', new Date(0).toISOString());

    const first = await runAutoBackupIfDue({ db, dbPath, backupsDir });
    expect(first).toBeTruthy();
    expect(first).toMatch(/\.nts-backup\.zip$/);

    db.appMeta.set('backup.auto.lastRunAt', new Date(0).toISOString());
    await runAutoBackupIfDue({ db, dbPath, backupsDir });
    await runAutoBackupIfDue({ db, dbPath, backupsDir });

    const autoFiles = fs
      .readdirSync(backupsDir)
      .filter((name) => name.startsWith('khepree-novel-ai-auto-'));
    expect(autoFiles.length).toBeGreaterThanOrEqual(1);
    expect(autoFiles.length).toBeLessThanOrEqual(4);

    const cfg = getAutoBackupConfig(db);
    expect(cfg.enabled).toBe(true);
    expect(cfg.retentionDaily).toBe(2);
  });

  it('term import preview detects duplicates', () => {
    db.terms.create({
      source_simplified: '青云门',
      scope: 'PROJECT',
      scope_ref: projectId,
      preferred_translation: 'Thanh Vân Môn',
    });
    const service = new TermService();
    const preview = service.previewImport({
      format: 'csv',
      content: 'sourceText,preferredTranslation\n青云门,Other',
      projectId,
    });
    expect(preview.duplicateCount).toBe(1);
    expect(preview.rows[0]?.duplicateOfTermId).toBeTruthy();
  });

  it('term commit import skip duplicates', () => {
    db.terms.create({
      source_simplified: '李逍遥',
      scope: 'GLOBAL',
      preferred_translation: 'Lý Tiêu Dao',
    });
    const service = new TermService();
    const result = service.commitImport({
      format: 'json',
      content: JSON.stringify([{ sourceText: '李逍遥', preferredTranslation: 'Other' }]),
      scope: 'GLOBAL',
      duplicateStrategy: 'skip',
    });
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });
});
