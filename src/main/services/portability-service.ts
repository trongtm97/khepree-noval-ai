import fs from 'node:fs';
import path from 'node:path';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { ExportDirectoryScope } from '@shared/constants/export-settings';
import type { NovelExportFormat } from '@shared/constants/portability';
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
import { writeFileAtomic } from '../portability/atomic-write';
import { validateExportDirectory } from '../portability/export-directory-validator';
import {
  getDefaultExportDirectoryInfo,
  getExportSettings,
  setDefaultExportDirectory,
  setAutoProjectSubfolder,
} from '../portability/export-settings-service';
import {
  isPathWithinExportDirectory,
  resolveExportDirectory,
  resolveExportPath,
} from '../portability/export-path-resolver';
import { recordExportHistory } from '../portability/export-history';
import {
  buildChapterExportFilename,
  buildChapterRangeExportFilename,
  buildNovelExportFilename,
} from '@shared/utils/sanitize-filename';

export class PortabilityService {
  constructor(
    private readonly getDb: () => DatabaseManager,
    private readonly getDbPath: () => string,
  ) {}

  private backupsDir(): string {
    return resolveBackupDirectory(this.getDb(), pathsService.getPath('backups'));
  }

  resolveExportDirectory(input: { projectId: string; editionId?: string | null }) {
    return resolveExportDirectory(this.getDb(), input);
  }

  getDefaultExportDirectory() {
    return getDefaultExportDirectoryInfo(this.getDb());
  }

  getExportSettings() {
    return getExportSettings(this.getDb());
  }

  setDefaultExportDirectory(directory: string | null) {
    const resolved = setDefaultExportDirectory(this.getDb(), directory);
    return {
      directory: resolved,
      isConfigured: resolved != null,
    };
  }

  setAutoProjectSubfolder(enabled: boolean) {
    setAutoProjectSubfolder(this.getDb(), enabled);
    return getExportSettings(this.getDb());
  }

  getProjectExportSettings(projectId: string) {
    const db = this.getDb();
    const project = db.projects.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    const global = getDefaultExportDirectoryInfo(db);
    const resolved = resolveExportDirectory(db, { projectId });
    return {
      projectExportDirectory: project.export_directory,
      useProjectOverride: project.export_directory != null && project.export_directory.trim() !== '',
      defaultExportDirectory: global.directory,
      resolvedDirectory: resolved.status === 'ok' ? resolved.directory : null,
      resolvedSource: resolved.status === 'ok' ? resolved.source : null,
    };
  }

  setProjectExportDirectory(projectId: string, directory: string | null) {
    const db = this.getDb();
    if (directory != null && directory.trim() !== '') {
      const validation = validateExportDirectory(directory, { create: true });
      if (!validation.valid) {
        throw new Error(`Invalid export directory: ${validation.error ?? 'INACCESSIBLE'}`);
      }
      db.projects.updateExportDirectory(projectId, validation.path);
    } else {
      db.projects.updateExportDirectory(projectId, null);
    }
    return this.getProjectExportSettings(projectId);
  }

  persistExportDirectory(input: {
    projectId: string;
    directory: string;
    scope: ExportDirectoryScope;
  }) {
    const validation = validateExportDirectory(input.directory, { create: true });
    if (!validation.valid) {
      throw new Error(`Invalid export directory: ${validation.error ?? 'INACCESSIBLE'}`);
    }
    if (input.scope === 'project') {
      this.getDb().projects.updateExportDirectory(input.projectId, validation.path);
    } else {
      setDefaultExportDirectory(this.getDb(), validation.path);
    }
    return resolveExportDirectory(this.getDb(), { projectId: input.projectId });
  }

  openDefaultExportDirectory() {
    const info = getDefaultExportDirectoryInfo(this.getDb());
    if (!info.directory) {
      throw new Error('EXPORT_DIRECTORY_MISSING');
    }
    const validation = validateExportDirectory(info.directory);
    if (!validation.valid) {
      throw new Error(`EXPORT_DIRECTORY_INACCESSIBLE:${info.directory}`);
    }
    return { directory: validation.path };
  }

  openExportDirectory(input: { projectId: string; editionId?: string | null }) {
    const resolved = resolveExportDirectory(this.getDb(), input);
    if (resolved.status === 'inaccessible') {
      throw new Error(`EXPORT_DIRECTORY_INACCESSIBLE:${resolved.configuredPath}`);
    }
    if (resolved.status === 'missing') {
      throw new Error('EXPORT_DIRECTORY_MISSING');
    }
    return { directory: resolved.directory };
  }

  openExportedFile(input: { projectId: string; filePath: string; editionId?: string | null }) {
    const resolved = resolveExportDirectory(this.getDb(), input);
    if (resolved.status !== 'ok') {
      throw new Error('EXPORT_DIRECTORY_UNAVAILABLE');
    }
    const normalized = path.resolve(input.filePath);
    if (!isPathWithinExportDirectory(normalized, resolved.directory)) {
      throw new Error('EXPORT_FILE_OUTSIDE_DIRECTORY');
    }
    if (!fs.existsSync(normalized)) {
      throw new Error('EXPORT_FILE_NOT_FOUND');
    }
    return { filePath: normalized };
  }

  async exportNovel(input: {
    projectId: string;
    format: NovelExportFormat;
    chapterFrom?: number;
    chapterTo?: number;
    translatedOnly?: boolean;
    includeChapterTitles?: boolean;
    includeParagraphIds?: boolean;
    outputPath?: string;
    editionId?: string | null;
    skipHistory?: boolean;
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

    const ext = input.format;
    let filePath = input.outputPath;
    if (!filePath) {
      const resolved = resolveExportPath(db, {
        projectId: input.projectId,
        editionId: input.editionId,
        format: input.format,
        category: 'BOOK',
      });
      if (resolved.status !== 'ok') {
        throw new Error(
          resolved.status === 'missing'
            ? 'EXPORT_DIRECTORY_MISSING'
            : `EXPORT_DIRECTORY_INACCESSIBLE:${resolved.configuredPath}`,
        );
      }
      filePath = path.join(resolved.directory, buildNovelExportFilename(data.projectTitle, ext));
    }

    if (input.format === 'txt') {
      writeFileAtomic(filePath, renderNovelPlainText(data, renderOpts));
    } else if (input.format === 'docx') {
      const body = renderNovelPlainText(data, renderOpts);
      const buffer = await buildMinimalDocxBuffer(data.projectTitle, body);
      writeFileAtomic(filePath, buffer);
    } else {
      const buffer = await buildEpubBuffer(data, renderOpts);
      writeFileAtomic(filePath, buffer);
    }

    if (!input.skipHistory) {
      recordExportHistory(db, {
        projectId: input.projectId,
        editionId: input.editionId ?? null,
        format: input.format,
        path: filePath,
      });
    }

    return {
      filePath,
      chapterCount: data.chapters.length,
      paragraphCount: countExportParagraphs(data),
      format: input.format,
    };
  }

  async exportChapterToDirectory(input: {
    projectId: string;
    chapterNumber: number;
    chapterTitle?: string | null;
    format: Extract<NovelExportFormat, 'txt' | 'docx'>;
    editionId?: string | null;
    outputDirectory?: string;
  }): Promise<{
    filePath: string;
    chapterCount: number;
    paragraphCount: number;
    format: Extract<NovelExportFormat, 'txt' | 'docx'>;
    exportDirectory: string;
  }> {
    const db = this.getDb();
    let exportDir = input.outputDirectory;
    if (!exportDir) {
      const resolved = resolveExportPath(db, {
        projectId: input.projectId,
        editionId: input.editionId,
        format: input.format,
        category: 'CHAPTER',
      });
      if (resolved.status === 'missing') {
        throw new Error('EXPORT_DIRECTORY_MISSING');
      }
      if (resolved.status === 'inaccessible') {
        throw new Error(`EXPORT_DIRECTORY_INACCESSIBLE:${resolved.configuredPath}`);
      }
      exportDir = resolved.directory;
    } else {
      const validation = validateExportDirectory(exportDir, { create: true });
      if (!validation.valid) {
        throw new Error(`EXPORT_DIRECTORY_INACCESSIBLE:${exportDir}`);
      }
      exportDir = validation.path;
    }

    const fileName = buildChapterExportFilename(
      input.chapterNumber,
      input.chapterTitle,
      input.format,
    );
    const filePath = path.join(exportDir, fileName);
    const result = await this.exportNovel({
      projectId: input.projectId,
      format: input.format,
      chapterFrom: input.chapterNumber,
      chapterTo: input.chapterNumber,
      translatedOnly: false,
      includeChapterTitles: true,
      includeParagraphIds: false,
      outputPath: filePath,
      editionId: input.editionId,
    });
    return {
      filePath: result.filePath,
      chapterCount: result.chapterCount,
      paragraphCount: result.paragraphCount,
      format: input.format,
      exportDirectory: exportDir,
    };
  }

  async exportChapterRangeToDirectory(input: {
    projectId: string;
    chapterFrom: number;
    chapterTo: number;
    format: Extract<NovelExportFormat, 'txt' | 'docx'>;
    editionId?: string | null;
    outputDirectory?: string;
  }) {
    const db = this.getDb();
    let exportDir = input.outputDirectory;
    if (!exportDir) {
      const resolved = resolveExportPath(db, {
        projectId: input.projectId,
        editionId: input.editionId,
        format: input.format,
        category: 'CHAPTER',
      });
      if (resolved.status === 'missing') {
        throw new Error('EXPORT_DIRECTORY_MISSING');
      }
      if (resolved.status === 'inaccessible') {
        throw new Error(`EXPORT_DIRECTORY_INACCESSIBLE:${resolved.configuredPath}`);
      }
      exportDir = resolved.directory;
    }

    const fileName = buildChapterRangeExportFilename(
      input.chapterFrom,
      input.chapterTo,
      input.format,
    );
    const filePath = path.join(exportDir, fileName);
    const result = await this.exportNovel({
      projectId: input.projectId,
      format: input.format,
      chapterFrom: input.chapterFrom,
      chapterTo: input.chapterTo,
      translatedOnly: false,
      includeChapterTitles: true,
      includeParagraphIds: false,
      outputPath: filePath,
      editionId: input.editionId,
    });
    return {
      filePath: result.filePath,
      chapterCount: result.chapterCount,
      paragraphCount: result.paragraphCount,
      format: input.format,
      exportDirectory: exportDir,
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
