import fs from 'node:fs';
import path from 'node:path';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { DatabaseManager } from '../db/database-manager';
import { pathsService } from './paths-service';
import {
  loadNovelExportData,
  renderNovelPlainText,
  countExportParagraphs,
  buildMinimalDocxBuffer,
  buildEpubBuffer,
} from '../portability/novel-export-builder';
import {
  createBackupArchive,
  previewBackupArchiveAsync,
  restoreBackupArchiveAsync,
} from '../portability/backup-archive';
import {
  getAutoBackupConfig,
  setAutoBackupConfig,
  listBackupFiles,
  createManualDbBackup,
} from '../portability/auto-backup';
import {
  getBackupDirectory,
  resolveBackupDirectory,
  setBackupDirectory,
} from '../portability/backup-directory';

export class PortabilityService {
  constructor(
    private readonly getDb: () => DatabaseManager,
    private readonly getDbPath: () => string,
  ) {}

  private backupsDir(): string {
    return resolveBackupDirectory(this.getDb(), pathsService.getPath('backups'));
  }

  async exportNovel(input: {
    projectId: string;
    format: import('@shared/constants/portability').NovelExportFormat;
    chapterFrom?: number;
    chapterTo?: number;
    translatedOnly?: boolean;
    includeChapterTitles?: boolean;
    includeParagraphIds?: boolean;
    outputPath?: string;
  }): Promise<{
    filePath: string;
    chapterCount: number;
    paragraphCount: number;
    format: import('@shared/constants/portability').NovelExportFormat;
  }> {
    const db = this.getDb();
    const data = loadNovelExportData(db, {
      projectId: input.projectId,
      chapterFrom: input.chapterFrom,
      chapterTo: input.chapterTo,
      translatedOnly: input.translatedOnly ?? false,
    });

    if (data.chapters.length === 0) {
      throw new Error('No chapters match export criteria');
    }

    const renderOpts = {
      includeChapterTitles: input.includeChapterTitles ?? true,
      includeParagraphIds: input.includeParagraphIds ?? false,
      useTranslation: true,
    };

    const safeTitle = data.projectTitle.replace(/[^\w.-]+/g, '_').slice(0, 48);
    const ext = input.format;
    const defaultPath = path.join(
      pathsService.getPath('exports'),
      `${safeTitle}.${ext}`,
    );
    const filePath = input.outputPath ?? defaultPath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (input.format === 'txt') {
      fs.writeFileSync(filePath, renderNovelPlainText(data, renderOpts), 'utf8');
    } else if (input.format === 'docx') {
      const body = renderNovelPlainText(data, renderOpts);
      const buffer = await buildMinimalDocxBuffer(data.projectTitle, body);
      fs.writeFileSync(filePath, buffer);
    } else {
      const buffer = await buildEpubBuffer(data, renderOpts);
      fs.writeFileSync(filePath, buffer);
    }

    return {
      filePath,
      chapterCount: data.chapters.length,
      paragraphCount: countExportParagraphs(data),
      format: input.format,
    };
  }

  async createBackup(input: {
    kind: 'full' | 'project';
    projectId?: string;
    outputPath?: string;
    includeCredentials?: boolean;
  }): Promise<{ filePath: string; kind: 'full' | 'project'; schemaVersion: number }> {
    const db = this.getDb();
    const backupsDir = this.backupsDir();
    const result = await createBackupArchive({
      kind: input.kind,
      db,
      dbPath: this.getDbPath(),
      backupsDir,
      outputPath: input.outputPath,
      projectId: input.projectId,
      includeCredentials: input.includeCredentials,
    });
    return {
      filePath: result.filePath,
      kind: result.manifest.kind,
      schemaVersion: result.manifest.schemaVersion,
    };
  }

  previewRestore(archivePath: string) {
    return previewBackupArchiveAsync(archivePath, this.getDbPath());
  }

  restoreBackup(input: { archivePath: string; confirmOverwrite: boolean }) {
    return restoreBackupArchiveAsync({
      archivePath: input.archivePath,
      dbPath: this.getDbPath(),
      backupsDir: this.backupsDir(),
      confirmOverwrite: input.confirmOverwrite,
      db: this.getDb(),
    });
  }

  getAutoBackupConfig(): AutoBackupConfig {
    return getAutoBackupConfig(this.getDb());
  }

  setAutoBackupConfig(patch: {
    enabled: boolean;
    intervalHours: number;
    retentionDaily: number;
    retentionWeekly: number;
    retentionMonthly: number;
  }): AutoBackupConfig {
    return setAutoBackupConfig(this.getDb(), patch);
  }

  getBackupDirectory() {
    return getBackupDirectory(this.getDb(), pathsService.getPath('backups'));
  }

  setBackupDirectory(directory: string | null) {
    const resolved = setBackupDirectory(this.getDb(), directory);
    return {
      directory: resolved || pathsService.getPath('backups'),
      isCustom: resolved.length > 0,
    };
  }

  listBackups() {
    return { backups: listBackupFiles(this.backupsDir()) };
  }

  createManualBackup(): { filePath: string } {
    const filePath = createManualDbBackup(this.getDbPath(), this.backupsDir());
    return { filePath };
  }
}
