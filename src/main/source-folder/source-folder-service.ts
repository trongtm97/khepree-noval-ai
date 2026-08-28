import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { formatParagraphId, formatParagraphIdForChapter } from '@shared/utils/stable-id';
import type { ChapterType } from '@shared/constants/book-metadata';
import type {
  FolderPreviewDtoSchema,
  FolderScanResultDto,
  SourceFolderSettingsDto,
} from '@shared/schemas/source-folder';
import type { z } from 'zod';
import { FOLDER_PREVIEW_SESSION_TTL_MS } from '@shared/constants/source-folder';
import { getDatabase, withTransaction } from '../db/connection';
import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';
import { segmentParagraphs } from '../import/paragraphs/segment';
import { classifySourceFile } from './source-file-classifier';
import { detectChapterFile } from './chapter-file-detector';
import {
  applyBookMetadataFromScan,
  importProjectDocumentsFromScan,
} from './book-metadata-service';
import {
  chapterRowToSnapshot,
  scanSourceFolder,
  type DbChapterSnapshot,
} from './folder-scanner';
import { computeLineDiff } from './source-diff';
import {
  clearFolderUnavailableNotice,
  emitSourceFolderEvent,
} from './source-folder-event-bridge';
import { getJobService } from '../services/job-service-singleton';
import { logger } from '../logging/logger';
import {
  assertSourceTargetDiffer,
  defaultImportTargetLanguage,
  detectionCheckedAt,
  resolveImportSourceLanguage,
} from '../services/source-language-import';
import type { ProjectRow } from '../db/repositories/project-repository';

export type FolderPreviewDto = z.infer<typeof FolderPreviewDtoSchema>;

interface FolderPreviewSession {
  previewId: string;
  folderPath: string;
  scanResult: FolderScanResultDto;
  expectedStartChapter?: number | null;
  expectedEndChapter?: number | null;
  createdAt: number;
}

export class SourceFolderService {
  private readonly previewSessions = new Map<string, FolderPreviewSession>();
  private readonly scanAbortControllers = new Map<string, AbortController>();

  private paragraphRef(
    chapterType: ChapterType,
    chapterNumber: number | null,
  ): Parameters<typeof formatParagraphIdForChapter>[0] {
    if (chapterType === 'PROLOGUE') return { kind: 'special', token: 'PROLOGUE' };
    if (chapterType === 'EPILOGUE') return { kind: 'special', token: 'EPILOGUE' };
    if (chapterType === 'EXTRA' || chapterType === 'SIDE_STORY') {
      return { kind: 'special', token: 'EXTRA' };
    }
    if (chapterNumber == null || chapterNumber <= 0) {
      return { kind: 'special', token: 'SPECIAL' };
    }
    return { kind: 'number', chapterNumber };
  }

  async selectFolderDialog(): Promise<{ canceled: boolean; folderPath: string | null }> {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, folderPath: null };
    }
    return { canceled: false, folderPath: result.filePaths[0] ?? null };
  }

  async createFolderPreview(input: {
    folderPath: string;
    expectedStartChapter?: number | null;
    expectedEndChapter?: number | null;
    onProgress?: (processed: number, total: number) => void;
  }): Promise<FolderPreviewDto> {
    await this.assertFolderAccessible(input.folderPath);
    const scanResult = await scanSourceFolder({
      folderPath: input.folderPath,
      expectedStartChapter: input.expectedStartChapter,
      expectedEndChapter: input.expectedEndChapter,
      onProgress: input.onProgress,
    });
    const previewId = newId();
    this.previewSessions.set(previewId, {
      previewId,
      folderPath: input.folderPath,
      scanResult,
      expectedStartChapter: input.expectedStartChapter,
      expectedEndChapter: input.expectedEndChapter,
      createdAt: Date.now(),
    });
    return { previewId, folderPath: input.folderPath, scanResult };
  }

  async scanProject(
    projectId: string,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<FolderScanResultDto> {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (project?.source_mode !== 'FOLDER' || !project.source_folder_path) {
      throw new Error('Project is not configured for folder source');
    }

    await this.assertFolderAccessible(project.source_folder_path);
    clearFolderUnavailableNotice(projectId);

    const controller = new AbortController();
    this.scanAbortControllers.set(projectId, controller);

    logger.info('source-folder SCAN_STARTED', { projectId, module: 'source-folder' });
    emitSourceFolderEvent({
      type: 'scan_progress',
      projectId,
      message: `Bắt đầu quét thư mục ${project.title}.`,
    });

    try {
      const snapshots = this.buildSnapshots(projectId);
      const scanResult = await scanSourceFolder({
        folderPath: project.source_folder_path,
        existingChapters: snapshots,
        expectedStartChapter: project.expected_start_chapter,
        expectedEndChapter: project.expected_end_chapter,
        sourceLanguage: project.source_language,
        onProgress: (processed, total) => {
          onProgress?.(processed, total);
          emitSourceFolderEvent({
            type: 'scan_progress',
            projectId,
            message: `Đang quét… ${processed} / ${total}`,
            detail: { processed, total },
          });
        },
        signal: controller.signal,
      });

      this.applyScanDiff(projectId, scanResult, { notify: true });
      db.projects.updateSourceFolderSettings(projectId, {
        last_folder_scan_at: utcNow(),
        source_folder_status: 'AVAILABLE',
      });

      logger.info('source-folder SCAN_COMPLETED', {
        projectId,
        module: 'source-folder',
        new: scanResult.newChapters.length,
      });

      emitSourceFolderEvent({
        type: 'scan_completed',
        projectId,
        message: `Đã kiểm tra ${scanResult.filesTotal} file.`,
        detail: { scanResult },
      });

      if (project.auto_import_new_chapters && scanResult.newChapters.length > 0) {
        await this.importChaptersFromScan(projectId, scanResult.newChapters.map((c) => c.chapterNumber));
      }

      return scanResult;
    } finally {
      this.scanAbortControllers.delete(projectId);
    }
  }

  cancelScan(projectId: string): void {
    this.scanAbortControllers.get(projectId)?.abort();
  }

  async commitFolderImport(input: {
    previewId: string;
    projectTitle: string;
    genre?: string | null;
    description?: string | null;
    chineseTitle?: string | null;
    sourceLanguageHint?: string | null;
    sourceLanguageMode?: 'AUTO' | 'HINTED';
    /** @deprecated Use sourceLanguageHint — ignored for truth. */
    sourceLanguage?: string | null;
    targetLanguage?: string | null;
    accountId?: string | null;
    styleConfig?: Record<string, unknown> | null;
    expectedStartChapter?: number | null;
    expectedEndChapter?: number | null;
  }): Promise<{ project: ProjectRow; chapterCount: number; paragraphCount: number; sourceDetection: import('@shared/schemas/source-language').SourceLanguageDetection }> {
    const session = this.requirePreview(input.previewId);
    const db = getDatabase();

    const importable = session.scanResult.newChapters.filter(
      (ch) => ch.status === 'new' && ch.chapterNumber > 0,
    );

    const hint =
      input.sourceLanguageHint ??
      (input.sourceLanguage && input.sourceLanguage.toUpperCase() !== 'AUTO'
        ? input.sourceLanguage
        : null);
    const mode =
      input.sourceLanguageMode ?? (hint ? 'HINTED' : 'AUTO');

    const { detection, sourceLanguageHint, sourceLanguageMode } =
      await resolveImportSourceLanguage({
        scanResult: session.scanResult,
        folderPath: session.folderPath,
        sourceLanguageHint: hint,
        sourceLanguageMode: mode,
      });

    const sourceLanguage = detection.detectedLanguage;
    const targetLanguage = defaultImportTargetLanguage(input.targetLanguage);
    assertSourceTargetDiffer(sourceLanguage, targetLanguage);

    const result = withTransaction(db.getConnection(), () => {
      const project = db.projects.create({
        title: input.projectTitle.trim(),
        genre: input.genre ?? null,
        description: input.chineseTitle
          ? [input.chineseTitle, input.description].filter(Boolean).join('\n')
          : (input.description ?? null),
        source_language: sourceLanguage,
        target_language: targetLanguage,
        source_language_mode: sourceLanguageMode,
        source_language_hint: sourceLanguageHint,
        source_language_confidence: detection.confidence,
        source_language_detection_method: detection.method,
        source_language_detection_checked_at: detectionCheckedAt(),
        source_mode: 'FOLDER',
        source_folder_path: session.folderPath,
        source_folder_status: 'AVAILABLE',
        watch_folder_enabled: true,
        scan_on_startup: true,
        auto_import_new_chapters: false,
        auto_queue_new_chapters: false,
        auto_translate_new_chapters: false,
        expected_start_chapter: input.expectedStartChapter ?? session.expectedStartChapter ?? null,
        expected_end_chapter: input.expectedEndChapter ?? session.expectedEndChapter ?? null,
      });

      if (input.styleConfig) {
        db.getConnection()
          .prepare(`UPDATE project_settings SET style_config = ?, updated_at = ? WHERE project_id = ?`)
          .run(JSON.stringify(input.styleConfig), utcNow(), project.id);
      }

      if (input.accountId) {
        db.googleAccounts.assignProject(input.accountId, project.id);
      }

      db.projects.updateSourceFolderSettings(project.id, {
        last_folder_scan_at: utcNow(),
      });

      const { chapterCount, paragraphCount } = this.importChapterEntries(
        project.id,
        importable.map((entry) => entry.chapterNumber),
        session.scanResult,
        session.folderPath,
      );

      this.importSpecialChapterEntries(project.id, session.scanResult, session.folderPath);
      applyBookMetadataFromScan(project.id, session.scanResult);
      importProjectDocumentsFromScan(project.id, session.scanResult, session.folderPath);

      if (session.scanResult.bookMetadata?.parsed) {
        emitSourceFolderEvent({
          type: 'scan_completed',
          projectId: project.id,
          message: 'Đã phát hiện thông tin truyện từ _BOOK_INFO.txt.',
        });
      }

      db.getConnection()
        .prepare(`UPDATE project_settings SET import_config = ?, updated_at = ? WHERE project_id = ?`)
        .run(
          JSON.stringify({
            sourceMode: 'FOLDER',
            folderPath: session.folderPath,
            importedAt: utcNow(),
            chapterCount,
          }),
          utcNow(),
          project.id,
        );

      return { project, chapterCount, paragraphCount, sourceDetection: detection };
    });

    this.previewSessions.delete(input.previewId);
    emitSourceFolderEvent({
      type: 'chapters_imported',
      projectId: result.project.id,
      message: `Đã thêm ${result.chapterCount} chương mới vào ${result.project.title}.`,
      detail: { chapterCount: result.chapterCount },
    });

    if (detection.hintMismatch) {
      logger.info('source_language_hint_mismatch', {
        event: 'LANGUAGE_HINT_MISMATCH',
        projectId: result.project.id,
        hint: sourceLanguageHint,
        detected: detection.detectedLanguage,
      });
    }

    return result;
  }

  async detectLanguageFromPreview(input: {
    previewId: string;
    sourceLanguageHint?: string | null;
    sourceLanguageMode?: 'AUTO' | 'HINTED';
  }) {
    const session = this.requirePreview(input.previewId);
    const hint =
      input.sourceLanguageMode === 'HINTED' && input.sourceLanguageHint
        ? input.sourceLanguageHint
        : null;
    const { detection } = await resolveImportSourceLanguage({
      scanResult: session.scanResult,
      folderPath: session.folderPath,
      sourceLanguageHint: hint,
      sourceLanguageMode: hint ? 'HINTED' : 'AUTO',
    });
    return detection;
  }

  async importChaptersFromScan(
    projectId: string,
    chapterNumbers: number[],
  ): Promise<{ imported: number; paragraphCount: number }> {
    if (chapterNumbers.length === 0) {
      return { imported: 0, paragraphCount: 0 };
    }
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project?.source_folder_path) {
      throw new Error('Project folder not configured');
    }

    const scanResult = await scanSourceFolder({
      folderPath: project.source_folder_path,
      existingChapters: this.buildSnapshots(projectId),
      expectedStartChapter: project.expected_start_chapter,
      expectedEndChapter: project.expected_end_chapter,
      sourceLanguage: project.source_language,
    });

    const { chapterCount, paragraphCount } = this.importChapterEntries(
      projectId,
      chapterNumbers,
      scanResult,
      project.source_folder_path,
    );

    this.runAutoPipeline(projectId, chapterNumbers);

    emitSourceFolderEvent({
      type: 'chapters_imported',
      projectId,
      message: `Đã nhập chương ${chapterNumbers[0]}–${chapterNumbers[chapterNumbers.length - 1]}.`,
      detail: { chapterNumbers },
    });

    return { imported: chapterCount, paragraphCount };
  }

  applyScanDiff(
    projectId: string,
    scanResult: FolderScanResultDto,
    options?: { notify?: boolean },
  ): void {
    const db = getDatabase();
    const now = utcNow();

    for (const entry of scanResult.modifiedChapters) {
      if (!entry.existingChapterId) continue;
      const existing = db.chapters.getById(entry.existingChapterId);
      if (!existing) continue;
      db.chapters.updateSourceMetadata(entry.existingChapterId, {
        source_status: 'SOURCE_MODIFIED',
        last_source_scan_at: now,
      });
      if (options?.notify) {
        emitSourceFolderEvent({
          type: 'modified_chapter',
          projectId,
          message: `Chương ${entry.chapterNumber} có nội dung nguồn mới.`,
          detail: { chapterNumber: entry.chapterNumber, chapterId: entry.existingChapterId },
        });
      }
    }

    for (const missing of scanResult.missingChapters) {
      db.chapters.updateSourceMetadata(missing.chapterId, {
        source_status: 'SOURCE_MISSING',
        last_source_scan_at: now,
      });
      if (options?.notify) {
        emitSourceFolderEvent({
          type: 'missing_chapter',
          projectId,
          message: `Không tìm thấy file nguồn của chương ${missing.chapterNumber}.`,
          detail: { chapterNumber: missing.chapterNumber },
        });
      }
    }

    for (const dup of scanResult.duplicateChapters) {
      if (dup.files.length < 2) continue;
      const hashes = new Set(dup.files.map((f) => f.contentHash));
      if (hashes.size > 1) {
        const existing = db.chapters.getByProjectAndNumber(projectId, dup.chapterNumber);
        if (existing) {
          db.chapters.updateSourceMetadata(existing.id, {
            source_status: 'SOURCE_CONFLICT',
            last_source_scan_at: now,
          });
        }
        if (options?.notify) {
          emitSourceFolderEvent({
            type: 'conflict',
            projectId,
            message: `Có hai file cùng được nhận diện là chương ${dup.chapterNumber}.`,
            detail: { chapterNumber: dup.chapterNumber },
          });
        }
      }
    }

    if (options?.notify && scanResult.newChapters.length > 0) {
      const nums = scanResult.newChapters.map((c) => c.chapterNumber).sort((a, b) => a - b);
      emitSourceFolderEvent({
        type: 'new_chapters',
        projectId,
        message: `Phát hiện ${nums.length} chương mới (${nums[0]}–${nums[nums.length - 1]}).`,
        detail: { chapterNumbers: nums },
      });
    }
  }

  async resolveConflict(
    projectId: string,
    chapterNumber: number,
    chosenFilePath: string,
  ): Promise<void> {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project?.source_folder_path) {
      throw new Error('Project folder not configured');
    }
    const buffer = await fs.readFile(chosenFilePath);
    const stat = await fs.stat(chosenFilePath);
    const detected = detectChapterFile({
      filePath: chosenFilePath,
      buffer,
      stat,
      sourceLanguage: project.source_language,
    });
    if (detected.readError || detected.chapterNumber !== chapterNumber) {
      throw new Error(detected.readError ?? 'File không khớp số chương');
    }

    const existing = db.chapters.getByProjectAndNumber(projectId, chapterNumber);
    const paragraphs = segmentParagraphs(detected.normalizedText);
    const now = utcNow();

    if (existing) {
      db.paragraphs.deleteByChapter(existing.id);
      for (const [idx, para] of paragraphs.entries()) {
        db.paragraphs.create({
          chapter_id: existing.id,
          paragraph_id: formatParagraphId(chapterNumber, idx + 1),
          sequence: idx + 1,
          source_text: para.text,
            trailing_newlines: para.trailingNewlines,
        });
      }
      db.chapters.updateSourceMetadata(existing.id, {
        chapter_title: detected.chapterTitle,
        source_text: detected.normalizedText,
        source_file_path: detected.sourceFilePath,
        source_file_name: detected.sourceFileName,
        source_file_size: detected.sourceFileSize,
        source_file_modified_at: detected.fileModifiedAt,
        source_file_hash: detected.sourceFileHash,
        source_content_hash: detected.contentHash,
        source_status: 'SOURCE_READY',
        source_encoding: detected.encoding,
        last_source_scan_at: now,
      });
      return;
    }

    const row = db.chapters.create({
      project_id: projectId,
      chapter_number: chapterNumber,
      sequence_order: chapterNumber,
      chapter_title: detected.chapterTitle,
      source_text: detected.normalizedText,
      status: 'pending',
      source_file_path: detected.sourceFilePath,
      source_file_name: detected.sourceFileName,
      source_file_size: detected.sourceFileSize,
      source_file_modified_at: detected.fileModifiedAt,
      source_file_hash: detected.sourceFileHash,
      source_content_hash: detected.contentHash,
      source_status: 'SOURCE_READY',
      source_encoding: detected.encoding,
      last_source_scan_at: now,
    });
    for (const [idx, para] of paragraphs.entries()) {
      db.paragraphs.create({
        chapter_id: row.id,
        paragraph_id: formatParagraphId(chapterNumber, idx + 1),
        sequence: idx + 1,
        source_text: para.text,
        trailing_newlines: para.trailingNewlines,
      });
    }
  }

  markRetranslate(projectId: string, chapterId: string): void {
    const db = getDatabase();
    const chapter = db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found');
    }
    db.chapters.updateSourceMetadata(chapterId, {
      status: 'needs_retranslation',
      source_status: 'SOURCE_MODIFIED',
    });
  }

  async getSourceDiff(
    projectId: string,
    chapterId: string,
  ): Promise<{ oldText: string; newText: string; lines: ReturnType<typeof computeLineDiff> }> {
    return this.getSourceDiffAsync(projectId, chapterId);
  }

  async getSourceDiffAsync(
    projectId: string,
    chapterId: string,
  ): Promise<{ oldText: string; newText: string; lines: ReturnType<typeof computeLineDiff> }> {
    const db = getDatabase();
    const chapter = db.chapters.getById(chapterId);
    if (chapter?.project_id !== projectId) {
      throw new Error('Chapter not found');
    }
    if (!chapter.source_file_path) {
      throw new Error('Chapter has no source file path');
    }
    const buffer = await fs.readFile(chapter.source_file_path);
    const stat = await fs.stat(chapter.source_file_path);
    const project = db.projects.getById(projectId);
    const detected = detectChapterFile({
      filePath: chapter.source_file_path,
      buffer,
      stat,
      sourceLanguage: project?.source_language,
    });
    return {
      oldText: chapter.source_text ?? '',
      newText: detected.normalizedText,
      lines: computeLineDiff(chapter.source_text ?? '', detected.normalizedText),
    };
  }

  getStatus(projectId: string): {
    projectId: string;
    settings: SourceFolderSettingsDto;
    scanSummary: {
      filesTotal: number;
      recognizedFiles: number;
      newCount: number;
      modifiedCount: number;
      missingCount: number;
      conflictCount: number;
      errorCount: number;
      watching: boolean;
    } | null;
  } {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const chapters = db.chapters.listByProject(projectId);
    const settings = this.toSettingsDto(project);
    const scanSummary = {
      filesTotal: chapters.filter((c) => c.source_file_path).length,
      recognizedFiles: chapters.filter((c) => c.source_status === 'SOURCE_READY').length,
      newCount: 0,
      modifiedCount: chapters.filter((c) => c.source_status === 'SOURCE_MODIFIED').length,
      missingCount: chapters.filter((c) => c.source_status === 'SOURCE_MISSING').length,
      conflictCount: chapters.filter((c) => c.source_status === 'SOURCE_CONFLICT').length,
      errorCount: chapters.filter((c) => c.source_status === 'SOURCE_ERROR').length,
      watching: project.watch_folder_enabled === 1 && project.source_mode === 'FOLDER',
    };

    return { projectId, settings, scanSummary };
  }

  updateSettings(
    projectId: string,
    patch: Partial<SourceFolderSettingsDto>,
  ): SourceFolderSettingsDto {
    const db = getDatabase();
    const updated = db.projects.updateSourceFolderSettings(projectId, {
      watch_folder_enabled: patch.watchFolderEnabled,
      scan_on_startup: patch.scanOnStartup,
      auto_import_new_chapters: patch.autoImportNewChapters,
      auto_queue_new_chapters: patch.autoQueueNewChapters,
      auto_translate_new_chapters: patch.autoTranslateNewChapters,
      expected_start_chapter: patch.expectedStartChapter,
      expected_end_chapter: patch.expectedEndChapter,
    });
    if (!updated) {
      throw new Error('Project not found');
    }
    return this.toSettingsDto(updated);
  }

  async changeSourceFolder(
    projectId: string,
    newFolderPath: string,
    confirm = false,
  ): Promise<{ preview: FolderScanResultDto; applied: boolean }> {
    await this.assertFolderAccessible(newFolderPath);
    const db = getDatabase();
    const snapshots = this.buildSnapshots(projectId);
    const project = db.projects.getById(projectId);
    const scanResult = await scanSourceFolder({
      folderPath: newFolderPath,
      existingChapters: snapshots,
      sourceLanguage: project?.source_language,
    });

    if (!confirm) {
      return { preview: scanResult, applied: false };
    }

    db.projects.updateSourceFolderSettings(projectId, {
      source_folder_path: newFolderPath,
      source_folder_status: 'AVAILABLE',
      source_mode: 'FOLDER',
      last_folder_scan_at: utcNow(),
    });

    for (const entry of [...scanResult.newChapters, ...scanResult.modifiedChapters]) {
      await this.importChaptersFromScan(projectId, [entry.chapterNumber]);
    }
    this.applyScanDiff(projectId, scanResult, { notify: true });

    return { preview: scanResult, applied: true };
  }

  async startupRescanAll(): Promise<void> {
    const db = getDatabase();
    const projects = db.projects.listFolderProjects().filter((p) => p.scan_on_startup === 1);
    for (const project of projects) {
      if (!project.source_folder_path) continue;
      try {
        await this.scanProject(project.id);
      } catch (err: unknown) {
        logger.warn('Startup folder scan failed', {
          projectId: project.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async scanSingleFile(projectId: string, filePath: string): Promise<void> {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project?.source_folder_path) return;

    if (!filePath.toLowerCase().endsWith('.txt')) return;
    if (!filePath.startsWith(project.source_folder_path)) return;

    const buffer = await fs.readFile(filePath);
    const stat = await fs.stat(filePath);
    const detected = detectChapterFile({
      filePath,
      buffer,
      stat,
      sourceLanguage: project.source_language,
    });

    if (detected.readError || detected.chapterNumber <= 0) {
      logger.warn('source-folder FILE_ADDED unreadable', {
        projectId,
        filePath,
        module: 'source-folder',
      });
      return;
    }

    const existing = db.chapters.getByProjectAndNumber(projectId, detected.chapterNumber);
    const now = utcNow();

    if (!existing) {
      if (project.auto_import_new_chapters) {
        await this.importChaptersFromScan(projectId, [detected.chapterNumber]);
      } else {
        emitSourceFolderEvent({
          type: 'new_chapters',
          projectId,
          message: `Phát hiện chương mới ${detected.chapterNumber}.`,
          detail: { chapterNumbers: [detected.chapterNumber] },
        });
      }
      return;
    }

    if (existing.source_content_hash === detected.contentHash) {
      db.chapters.updateSourceMetadata(existing.id, {
        source_status: 'SOURCE_READY',
        source_file_path: detected.sourceFilePath,
        last_source_scan_at: now,
      });
      return;
    }

    db.chapters.updateSourceMetadata(existing.id, {
      source_status: existing.status === 'pending' ? 'SOURCE_READY' : 'SOURCE_MODIFIED',
      last_source_scan_at: now,
    });

    if (existing.status === 'pending' && project.auto_import_new_chapters) {
      this.updateChapterFromFile(existing.id, detected);
    } else {
      emitSourceFolderEvent({
        type: 'modified_chapter',
        projectId,
        message: `Nguồn chương ${detected.chapterNumber} đã thay đổi.`,
        detail: { chapterNumber: detected.chapterNumber },
      });
    }
  }

  handleFileMissing(projectId: string, filePath: string): void {
    const db = getDatabase();
    const chapter = db.chapters
      .listByProject(projectId)
      .find((c) => c.source_file_path === filePath);
    if (!chapter) return;
    db.chapters.updateSourceMetadata(chapter.id, {
      source_status: 'SOURCE_MISSING',
      last_source_scan_at: utcNow(),
    });
    emitSourceFolderEvent({
      type: 'missing_chapter',
      projectId,
      message: `Không tìm thấy file nguồn của chương ${chapter.chapter_number}.`,
      detail: { chapterNumber: chapter.chapter_number },
    });
  }

  private importSpecialChapterEntries(
    projectId: string,
    scanResult: FolderScanResultDto,
    folderPath: string,
  ): number {
    const db = getDatabase();
    const projectRow = db.projects.getById(projectId);
    let imported = 0;

    for (const entry of scanResult.specialChapters) {
      if (entry.status !== 'new') continue;
      const existing = db.chapters.getBySourcePath(projectId, entry.sourceFilePath);
      if (existing) continue;

      const fullPath = path.isAbsolute(entry.sourceFilePath)
        ? entry.sourceFilePath
        : path.join(folderPath, entry.sourceFileName);
      const buffer = fsSync.readFileSync(fullPath);
      const stat = fsSync.statSync(fullPath);
      const classified = classifySourceFile({
        filePath: fullPath,
        buffer,
        stat,
        sourceLanguage: projectRow?.source_language,
      });
      if (classified.readError && !classified.normalizedText) continue;

      const chapterType = entry.chapterType;
      const paragraphs = segmentParagraphs(classified.normalizedText);
      const now = utcNow();
      const ref = this.paragraphRef(chapterType, entry.chapterNumber ?? null);

      const row = db.chapters.create({
        project_id: projectId,
        chapter_number: entry.chapterNumber ?? null,
        chapter_type: chapterType,
        sequence_order: entry.sequenceOrder,
        display_title: entry.displayTitle,
        chapter_title: entry.chapterTitle,
        source_text: classified.normalizedText,
        status: 'pending',
        source_file_path: fullPath,
        source_file_name: entry.sourceFileName,
        source_file_size: classified.sourceFileSize,
        source_file_modified_at: classified.fileModifiedAt,
        source_file_hash: classified.sourceFileHash,
        source_content_hash: classified.contentHash,
        source_status: 'SOURCE_READY',
        source_encoding: classified.encoding,
        last_source_scan_at: now,
      });

      for (const [idx, para] of paragraphs.entries()) {
        db.paragraphs.create({
          chapter_id: row.id,
          paragraph_id: formatParagraphIdForChapter(ref, idx + 1),
          sequence: idx + 1,
          source_text: para.text,
            trailing_newlines: para.trailingNewlines,
        });
      }

      imported += 1;
      logger.info('source-folder SPECIAL_CHAPTER_IMPORTED', {
        projectId,
        chapterType,
        sequenceOrder: entry.sequenceOrder,
        module: 'source-folder',
      });
    }

    return imported;
  }

  private importChapterEntries(
    projectId: string,
    chapterNumbers: number[],
    scanResult: FolderScanResultDto,
    folderPath: string,
  ): { chapterCount: number; paragraphCount: number } {
    const db = getDatabase();
    const numberSet = new Set(chapterNumbers);
    const entries = scanResult.newChapters.filter((c) => numberSet.has(c.chapterNumber));
    let paragraphCount = 0;

    for (const entry of entries) {
      const fullPath = path.isAbsolute(entry.sourceFilePath)
        ? entry.sourceFilePath
        : path.join(folderPath, entry.sourceFileName);
      const buffer = fsSync.readFileSync(fullPath);
      const stat = fsSync.statSync(fullPath);
      const projectRow = db.projects.getById(projectId);
      const detected = detectChapterFile({
        filePath: fullPath,
        buffer,
        stat,
        sourceLanguage: projectRow?.source_language,
      });
      if (detected.readError) {
        db.chapters.create({
          project_id: projectId,
          chapter_number: entry.chapterNumber,
          sequence_order: entry.chapterNumber,
          chapter_title: entry.chapterTitle,
          status: 'pending',
          source_file_path: fullPath,
          source_file_name: entry.sourceFileName,
          source_status: 'SOURCE_ERROR',
        });
        continue;
      }

      const existing = db.chapters.getByProjectAndNumber(projectId, entry.chapterNumber);
      const paragraphs = segmentParagraphs(detected.normalizedText);
      const now = utcNow();

      if (existing) {
        db.paragraphs.deleteByChapter(existing.id);
        for (const [idx, para] of paragraphs.entries()) {
          db.paragraphs.create({
            chapter_id: existing.id,
            paragraph_id: formatParagraphId(entry.chapterNumber, idx + 1),
            sequence: idx + 1,
            source_text: para.text,
            trailing_newlines: para.trailingNewlines,
          });
          paragraphCount += 1;
        }
        db.chapters.updateSourceMetadata(existing.id, {
          chapter_title: detected.chapterTitle,
          source_text: detected.normalizedText,
          source_file_path: fullPath,
          source_file_name: detected.sourceFileName,
          source_file_size: detected.sourceFileSize,
          source_file_modified_at: detected.fileModifiedAt,
          source_file_hash: detected.sourceFileHash,
          source_content_hash: detected.contentHash,
          source_status: 'SOURCE_READY',
          source_encoding: detected.encoding,
          last_source_scan_at: now,
          status: 'pending',
        });
      } else {
        const row = db.chapters.create({
          project_id: projectId,
          chapter_number: entry.chapterNumber,
          sequence_order: entry.chapterNumber,
          chapter_type: 'NORMAL',
          chapter_title: detected.chapterTitle,
          source_text: detected.normalizedText,
          status: 'pending',
          source_file_path: fullPath,
          source_file_name: detected.sourceFileName,
          source_file_size: detected.sourceFileSize,
          source_file_modified_at: detected.fileModifiedAt,
          source_file_hash: detected.sourceFileHash,
          source_content_hash: detected.contentHash,
          source_status: 'SOURCE_READY',
          source_encoding: detected.encoding,
          last_source_scan_at: now,
        });
        for (const [idx, para] of paragraphs.entries()) {
          db.paragraphs.create({
            chapter_id: row.id,
            paragraph_id: formatParagraphId(entry.chapterNumber, idx + 1),
            sequence: idx + 1,
            source_text: para.text,
            trailing_newlines: para.trailingNewlines,
          });
          paragraphCount += 1;
        }
      }

      logger.info('source-folder CHAPTER_IMPORTED', {
        projectId,
        chapterNumber: entry.chapterNumber,
        module: 'source-folder',
      });
    }

    return { chapterCount: entries.length, paragraphCount };
  }

  private updateChapterFromFile(
    chapterId: string,
    detected: Awaited<ReturnType<typeof detectChapterFile>>,
  ): void {
    const db = getDatabase();
    const paragraphs = segmentParagraphs(detected.normalizedText);
    db.paragraphs.deleteByChapter(chapterId);
    const chapter = db.chapters.getById(chapterId);
    if (!chapter) return;
    const ref = this.paragraphRef(chapter.chapter_type, chapter.chapter_number);
    for (const [idx, para] of paragraphs.entries()) {
      db.paragraphs.create({
        chapter_id: chapterId,
        paragraph_id: formatParagraphIdForChapter(ref, idx + 1),
        sequence: idx + 1,
        source_text: para.text,
        trailing_newlines: para.trailingNewlines,
      });
    }
    db.chapters.updateSourceMetadata(chapterId, {
      chapter_title: detected.chapterTitle,
      source_text: detected.normalizedText,
      source_file_hash: detected.sourceFileHash,
      source_content_hash: detected.contentHash,
      source_status: 'SOURCE_READY',
      source_encoding: detected.encoding,
      last_source_scan_at: utcNow(),
    });
  }

  private runAutoPipeline(projectId: string, chapterNumbers: number[]): void {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project) return;

    const shouldQueue =
      project.auto_queue_new_chapters === 1 || project.auto_translate_new_chapters === 1;
    if (!shouldQueue) return;

    const chapters = db.chapters
      .listByProject(projectId)
      .filter(
        (ch) =>
          ch.source_status === 'SOURCE_READY' &&
          (chapterNumbers.includes(ch.chapter_number ?? -1) ||
            ch.chapter_type === 'PROLOGUE'),
      )
      .sort((a, b) => a.sequence_order - b.sequence_order);

    for (const chapter of chapters) {
      const paragraphs = db.paragraphs.listByChapter(chapter.id);
      if (paragraphs.length === 0) continue;

      const from = chapter.chapter_number ?? chapter.sequence_order;
      getJobService().enqueueTranslate({
        projectId,
        chapterFrom: from,
        chapterTo: from,
        sourceParagraphIds: paragraphs.map((p) => p.paragraph_id),
        batchParagraphs: paragraphs.map((p) => ({
          paragraphId: p.paragraph_id,
          sourceText: p.source_text,
        })),
      });

      logger.info('source-folder auto queued chapter', {
        projectId,
        sequenceOrder: chapter.sequence_order,
        chapterType: chapter.chapter_type,
      });
    }
  }

  private buildSnapshots(projectId: string): DbChapterSnapshot[] {
    const db = getDatabase();
    return db.chapters.listByProject(projectId).map((row) => {
      const translations = db.translations.listByChapter(row.id);
      const hasTranslation = translations.some((t) => t.status === 'translated');
      return chapterRowToSnapshot(row, hasTranslation);
    });
  }

  private toSettingsDto(project: ProjectRow): SourceFolderSettingsDto {
    return {
      sourceMode: project.source_mode,
      sourceFolderPath: project.source_folder_path,
      sourceFolderStatus: project.source_folder_status,
      watchFolderEnabled: project.watch_folder_enabled === 1,
      scanOnStartup: project.scan_on_startup === 1,
      autoImportNewChapters: project.auto_import_new_chapters === 1,
      autoQueueNewChapters: project.auto_queue_new_chapters === 1,
      autoTranslateNewChapters: project.auto_translate_new_chapters === 1,
      expectedStartChapter: project.expected_start_chapter,
      expectedEndChapter: project.expected_end_chapter,
      lastFolderScanAt: project.last_folder_scan_at,
    };
  }

  async assertFolderAccessible(folderPath: string): Promise<void> {
    try {
      await fs.access(folderPath);
    } catch {
      throw new Error('Không thể truy cập thư mục nguồn.');
    }
  }

  private requirePreview(previewId: string): FolderPreviewSession {
    this.purgeExpiredPreviews();
    const session = this.previewSessions.get(previewId);
    if (!session) {
      throw new Error(`Folder preview expired or not found: ${previewId}`);
    }
    return session;
  }

  private purgeExpiredPreviews(): void {
    const now = Date.now();
    for (const [id, session] of this.previewSessions) {
      if (now - session.createdAt > FOLDER_PREVIEW_SESSION_TTL_MS) {
        this.previewSessions.delete(id);
      }
    }
  }
}
