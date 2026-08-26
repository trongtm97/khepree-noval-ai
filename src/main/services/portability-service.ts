import fs from 'node:fs';
import path from 'node:path';
import type { NovelExportFormat } from '@shared/constants/portability';
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

export class PortabilityService {
  constructor(
    private readonly getDb: () => DatabaseManager,
    private readonly getDbPath: () => string,
  ) {}

  async exportNovel(input: {
    projectId: string;
    format: NovelExportFormat;
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
    format: NovelExportFormat;
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
    const result = await createBackupArchive({
      kind: input.kind,
      db,
      dbPath: this.getDbPath(),
      backupsDir: pathsService.getPath('backups'),
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
      backupsDir: pathsService.getPath('backups'),
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
    retentionCount: number;
  }): AutoBackupConfig {
    return setAutoBackupConfig(this.getDb(), patch);
  }

  listBackups() {
    return { backups: listBackupFiles(pathsService.getPath('backups')) };
  }

  createManualBackup(): { filePath: string } {
    const filePath = createManualDbBackup(
      this.getDbPath(),
      pathsService.getPath('backups'),
    );
    return { filePath };
  }
}
