import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
  BATCH_IMPORT_DURABLE_DIR,
  type BatchImportProposedAction,
  type BatchImportResultStatus,
} from '@shared/constants/batch-import';
import type {
  BatchImportCandidateResultDto,
  BatchImportProgressEventDto,
  BatchImportSessionDetailDto,
  BatchImportSummaryDto,
} from '@shared/schemas/batch-import';
import { getDatabase } from '../db/connection';
import type {
  BatchImportCandidateRow,
  BatchImportSummary,
} from '../db/repositories/batch-import-repository';
import { utcNow } from '../db/utils/timestamps';
import { detectChapters } from '../import/chapter-detector';
import { sha256Text } from '../import/hash';
import { getImportService } from '../import';
import { parseImportFile } from '../import/parsers';
import { normalizeNovelText } from '../import/paragraphs/normalize';
import { pathsService } from '../services/paths-service';
import { detectChapterFile } from '../source-folder/chapter-file-detector';
import { chapterRowToSnapshot, scanSourceFolder } from '../source-folder/folder-scanner';
import {
  getSourceFolderService,
  getSourceWatcherManager,
} from '../source-folder/source-folder-singleton';
import { applyChapterSourceUpdateRespectingLocks } from './chapter-source-update';
import { copyPathToDurable, isPathInside } from './durable-copy';
import type { BatchImportPreflightService } from './batch-import-preflight-service';
import { candidateIdentityKey } from './source-identity';

export type BatchImportCommitProgressSink = (event: BatchImportProgressEventDto) => void;

function emptySummary(): BatchImportSummary {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    skippedDuplicate: 0,
    needsAttention: 0,
    failed: 0,
    total: 0,
  };
}

function parseSummary(json: string | null): BatchImportSummaryDto {
  if (!json) return emptySummary();
  try {
    return JSON.parse(json) as BatchImportSummaryDto;
  } catch {
    return emptySummary();
  }
}

function parseResultJson(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function emptyChapterDiff() {
  return {
    chaptersCreated: [] as number[],
    chaptersUpdated: [] as number[],
    chaptersMissing: [] as number[],
    chaptersUnchanged: [] as number[],
    preservedLockedParagraphs: 0,
  };
}

function friendlyError(
  code: string,
  en: string,
  vi: string,
): { errorCode: string; errorMessage: string; nextAction: string } {
  return {
    errorCode: code,
    errorMessage: `${en} / ${vi}`,
    nextAction:
      code === 'SOURCE_MISSING'
        ? 'Re-scan the source folder or ZIP, then retry this novel.'
        : 'Fix the source issue, then retry this novel only.',
  };
}

export class BatchImportCommitService {
  private progressSink: BatchImportCommitProgressSink | null = null;
  private committing = new Set<string>();

  constructor(private readonly preflight: BatchImportPreflightService) {}

  setProgressSink(sink: BatchImportCommitProgressSink | null): void {
    this.progressSink = sink;
  }

  private emit(event: BatchImportProgressEventDto): void {
    this.progressSink?.(event);
  }

  listSessions(limit = 20): BatchImportSessionDetailDto[] {
    const db = getDatabase();
    return db.batchImport.listRecentSessions(limit).map((row) => this.toSessionDetail(row.id));
  }

  listIncompleteSessions(): BatchImportSessionDetailDto[] {
    const db = getDatabase();
    return db.batchImport.listIncompleteSessions().map((row) => this.toSessionDetail(row.id));
  }

  getSession(sessionId: string): BatchImportSessionDetailDto {
    const detail = this.toSessionDetail(sessionId);
    if (!detail) throw new Error(`Batch import session not found: ${sessionId}`);
    return detail;
  }

  async commitFromPreflight(sessionId: string): Promise<BatchImportSessionDetailDto> {
    if (this.committing.has(sessionId)) {
      return this.getSession(sessionId);
    }
    this.committing.add(sessionId);
    try {
      const memory = this.preflight.getSessionForCommit(sessionId);
      const db = getDatabase();
      let sessionRow = db.batchImport.getSession(sessionId);

      if (!sessionRow && !memory) {
        throw new Error(`Preflight session not found: ${sessionId}`);
      }

      if (!sessionRow && memory) {
        sessionRow = db.batchImport.createSession({
          id: memory.sessionId,
          sourceKind: memory.sourceKind,
          sourcePath: memory.sourcePath,
          sourceLabel: memory.sourceLabel,
          status: 'COMMITTING',
        });
        for (const c of memory.candidates) {
          db.batchImport.upsertCandidate({
            id: c.candidateId,
            sessionId,
            candidateKey: c.candidateId,
            displayPath: c.displayPath,
            predictedTitle: c.predictedTitle,
            kind: c.analyzed.kind,
            format: c.analyzed.format,
            contentFingerprint: c.analyzed.contentFingerprint,
            sourceAbsolutePath: c.analyzed.absolutePath,
            proposedAction: c.proposedAction,
            selected: c.selected,
            targetProjectId: c.targetProjectId,
            status: !c.selected
              ? 'SKIPPED'
              : c.proposedAction === 'NEEDS_ATTENTION'
                ? 'NEEDS_ATTENTION'
                : c.proposedAction === 'SKIP'
                  ? 'SKIPPED'
                  : 'PENDING',
          });
        }
      } else if (sessionRow && sessionRow.status === 'COMPLETED') {
        return this.getSession(sessionId);
      } else if (sessionRow) {
        db.batchImport.updateSession(sessionId, { status: 'COMMITTING' });
      }

      const durableRoot = path.join(
        pathsService.getPath('data'),
        BATCH_IMPORT_DURABLE_DIR,
        sessionId,
      );
      await fsPromises.mkdir(durableRoot, { recursive: true });
      db.batchImport.updateSession(sessionId, { durableRoot, status: 'COMMITTING' });

      const sourceKind =
        memory?.sourceKind ?? db.batchImport.getSession(sessionId)!.source_kind;
      const tempDir = memory?.tempDir ?? null;

      if (sourceKind === 'zip' && memory) {
        this.emit({
          sessionId,
          phase: 'materializing',
          processed: 0,
          total: memory.candidates.filter((c) => c.selected).length,
          currentLabel: null,
          message: 'Copying ZIP novels to durable storage…',
        });
        let done = 0;
        const selected = memory.candidates.filter((c) => c.selected);
        for (const c of selected) {
          const dest = path.join(durableRoot, c.candidateId);
          await copyPathToDurable(c.analyzed.absolutePath, dest);
          const existingStatus = db.batchImport.getCandidate(c.candidateId)?.status;
          db.batchImport.upsertCandidate({
            id: c.candidateId,
            sessionId,
            candidateKey: c.candidateId,
            displayPath: c.displayPath,
            predictedTitle: c.predictedTitle,
            kind: c.analyzed.kind,
            format: c.analyzed.format,
            contentFingerprint: c.analyzed.contentFingerprint,
            sourceAbsolutePath: dest,
            proposedAction: c.proposedAction,
            selected: c.selected,
            targetProjectId: c.targetProjectId,
            status: existingStatus ?? 'PENDING',
          });
          done += 1;
          this.emit({
            sessionId,
            phase: 'materializing',
            processed: done,
            total: selected.length,
            currentLabel: c.displayPath,
            message: null,
          });
        }
        await this.preflight.releaseTempAfterMaterialize(sessionId);
      }

      const candidates = db.batchImport.listCandidates(sessionId);
      const work = candidates.filter((c) =>
        ['PENDING', 'FAILED', 'RUNNING'].includes(c.status),
      );
      let processed = 0;
      for (const candidate of work) {
        this.emit({
          sessionId,
          phase: 'committing',
          processed,
          total: work.length,
          currentLabel: candidate.display_path,
          message: null,
        });
        await this.processCandidate(sessionId, candidate, {
          sourceKind,
          tempDir,
          durableRoot,
        });
        processed += 1;
        this.emit({
          sessionId,
          phase: 'committing',
          processed,
          total: work.length,
          currentLabel: candidate.display_path,
          message: null,
        });
      }

      // Mark selected NEEDS_ATTENTION / SKIP that never ran
      for (const c of candidates) {
        if (c.status === 'NEEDS_ATTENTION' || c.status === 'SKIPPED') continue;
        if (!c.selected && c.status === 'PENDING') {
          db.batchImport.updateCandidateResult(c.id, { status: 'SKIPPED' });
        }
      }

      const summary = this.computeSummary(sessionId);
      db.batchImport.updateSession(sessionId, {
        status: 'COMPLETED',
        summary,
        completedAt: utcNow(),
      });

      this.preflight.dropMemorySession(sessionId);

      this.emit({
        sessionId,
        phase: 'commit_done',
        processed: summary.total,
        total: summary.total,
        currentLabel: null,
        message: null,
      });

      return this.getSession(sessionId);
    } finally {
      this.committing.delete(sessionId);
    }
  }

  async retryCandidate(
    sessionId: string,
    candidateId: string,
  ): Promise<BatchImportSessionDetailDto> {
    const db = getDatabase();
    const session = db.batchImport.getSession(sessionId);
    if (!session) throw new Error(`Batch import session not found: ${sessionId}`);
    const candidate = db.batchImport.getCandidate(candidateId);
    if (!candidate || candidate.session_id !== sessionId) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    // Idempotent: success states return as-is
    if (
      ['CREATED', 'UPDATED', 'SKIPPED', 'SKIPPED_DUPLICATE', 'NEEDS_ATTENTION'].includes(
        candidate.status,
      )
    ) {
      return this.getSession(sessionId);
    }

    db.batchImport.updateSession(sessionId, { status: 'COMMITTING', completedAt: null });
    await this.processCandidate(sessionId, candidate, {
      sourceKind: session.source_kind,
      tempDir: null,
      durableRoot: session.durable_root,
    });

    const remaining = db.batchImport
      .listCandidates(sessionId)
      .some((c) => ['PENDING', 'FAILED', 'RUNNING'].includes(c.status));
    const summary = this.computeSummary(sessionId);
    db.batchImport.updateSession(sessionId, {
      status: remaining ? 'COMMITTING' : 'COMPLETED',
      summary,
      completedAt: remaining ? null : utcNow(),
    });
    return this.getSession(sessionId);
  }

  private async processCandidate(
    _sessionId: string,
    candidate: BatchImportCandidateRow,
    ctx: {
      sourceKind: 'folder' | 'zip';
      tempDir: string | null;
      durableRoot: string | null;
    },
  ): Promise<void> {
    const db = getDatabase();

    if (
      ['CREATED', 'UPDATED', 'SKIPPED', 'SKIPPED_DUPLICATE', 'NEEDS_ATTENTION'].includes(
        candidate.status,
      )
    ) {
      return;
    }

    if (!candidate.selected || candidate.proposed_action === 'SKIP') {
      db.batchImport.updateCandidateResult(candidate.id, { status: 'SKIPPED' });
      return;
    }

    if (candidate.proposed_action === 'NEEDS_ATTENTION') {
      db.batchImport.updateCandidateResult(candidate.id, {
        status: 'NEEDS_ATTENTION',
        resultJson: {
          nextAction: 'Review warnings, pick CREATE or UPDATE_EXISTING, then retry.',
        },
      });
      return;
    }

    db.batchImport.updateCandidateResult(candidate.id, {
      status: 'RUNNING',
      incrementAttempt: true,
      errorMessage: null,
    });

    try {
      if (!fs.existsSync(candidate.source_absolute_path)) {
        const err = friendlyError(
          'SOURCE_MISSING',
          'Source path is missing (temp ZIP extract may have been cleaned).',
          'Đường dẫn nguồn không còn (thư mục ZIP tạm có thể đã bị xóa).',
        );
        db.batchImport.updateCandidateResult(candidate.id, {
          status: 'FAILED',
          errorMessage: err.errorMessage,
          resultJson: err,
        });
        return;
      }

      const kind = candidate.kind === 'folder' ? 'folder' : 'file';
      const identityKey = candidateIdentityKey(kind, candidate.source_absolute_path);
      const byIdentity = db.projects.findBySourceIdentityKey(identityKey);
      const byFp = db.projects.findByContentFingerprint(candidate.content_fingerprint);

      let action: BatchImportProposedAction | 'SKIP_DUPLICATE' = candidate.proposed_action;
      let targetId =
        candidate.target_project_id ?? byIdentity?.id ?? null;

      if (byIdentity && byIdentity.source_content_fingerprint === candidate.content_fingerprint) {
        action = 'SKIP_DUPLICATE';
        targetId = byIdentity.id;
      } else if (byIdentity) {
        action = 'UPDATE_EXISTING';
        targetId = byIdentity.id;
      } else if (
        byFp &&
        (candidate.proposed_action === 'CREATE' || !candidate.target_project_id)
      ) {
        // Same content already imported under another identity → skip duplicate project
        if (!candidate.target_project_id) {
          action = 'SKIP_DUPLICATE';
          targetId = byFp.id;
        } else {
          action = 'UPDATE_EXISTING';
          targetId = candidate.target_project_id;
        }
      } else if (candidate.proposed_action === 'UPDATE_EXISTING' && !targetId) {
        const err = friendlyError(
          'NO_TARGET',
          'UPDATE_EXISTING needs a target project.',
          'Cập nhật truyện cần chọn project đích.',
        );
        db.batchImport.updateCandidateResult(candidate.id, {
          status: 'FAILED',
          errorMessage: err.errorMessage,
          resultJson: err,
        });
        return;
      }

      if (action === 'SKIP_DUPLICATE' && targetId) {
        db.batchImport.updateCandidateResult(candidate.id, {
          status: 'SKIPPED_DUPLICATE',
          resultProjectId: targetId,
          resultJson: {
            ...emptyChapterDiff(),
            actionTaken: 'SKIP_DUPLICATE',
            projectId: targetId,
          },
        });
        return;
      }

      if (action === 'CREATE' || (!targetId && action !== 'UPDATE_EXISTING')) {
        const created = await this.createProject(candidate, identityKey, ctx);
        db.batchImport.updateCandidateResult(candidate.id, {
          status: 'CREATED',
          resultProjectId: created.projectId,
          resultJson: {
            ...created.diff,
            actionTaken: 'CREATE',
            projectId: created.projectId,
          },
        });
        this.maybeStartWatcher(created.projectId, candidate, ctx);
        return;
      }

      // UPDATE_EXISTING
      const projectId = targetId!;
      const updated = await this.updateProject(projectId, candidate, identityKey, ctx);
      db.batchImport.updateCandidateResult(candidate.id, {
        status: 'UPDATED',
        resultProjectId: projectId,
        resultJson: {
          ...updated,
          actionTaken: 'UPDATE_EXISTING',
          projectId,
        },
      });
      this.maybeStartWatcher(projectId, candidate, ctx);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const err = friendlyError(
        'IMPORT_FAILED',
        message || 'Import failed for this novel.',
        'Nhập truyện này thất bại.',
      );
      db.batchImport.updateCandidateResult(candidate.id, {
        status: 'FAILED',
        errorMessage: err.errorMessage,
        resultJson: { ...err, detail: message },
      });
    }
  }

  private maybeStartWatcher(
    projectId: string,
    candidate: BatchImportCandidateRow,
    ctx: { sourceKind: 'folder' | 'zip'; tempDir: string | null },
  ): void {
    if (candidate.kind !== 'folder') return;
    const folderPath = candidate.source_absolute_path;
    if (ctx.tempDir && isPathInside(ctx.tempDir, folderPath)) return;
    // Never watch unresolved ZIP temp paths
    if (ctx.sourceKind === 'zip') {
      const durable = path.join(pathsService.getPath('data'), BATCH_IMPORT_DURABLE_DIR);
      if (!isPathInside(durable, folderPath)) return;
    }
    try {
      getSourceWatcherManager().startWatcher(projectId);
    } catch {
      // watcher optional — import already succeeded
    }
  }

  private async createProject(
    candidate: BatchImportCandidateRow,
    identityKey: string,
    _ctx: { sourceKind: 'folder' | 'zip'; durableRoot: string | null },
  ): Promise<{ projectId: string; diff: ReturnType<typeof emptyChapterDiff> }> {
    const db = getDatabase();
    const diff = emptyChapterDiff();

    if (candidate.kind === 'folder') {
      const preview = await getSourceFolderService().createFolderPreview({
        folderPath: candidate.source_absolute_path,
      });
      const result = await getSourceFolderService().commitFolderImport({
        previewId: preview.previewId,
        projectTitle: candidate.predicted_title,
      });
      db.projects.updateSourceIdentity(result.project.id, {
        sourceIdentityKey: identityKey,
        sourceContentFingerprint: candidate.content_fingerprint,
        sourceFolderPath: candidate.source_absolute_path,
        sourceMode: 'FOLDER',
        watchFolderEnabled: true,
        sourceFolderStatus: 'AVAILABLE',
        title: candidate.predicted_title,
      });
      const chapters = db.chapters.listByProject(result.project.id);
      diff.chaptersCreated = chapters
        .map((c) => c.chapter_number)
        .filter((n): n is number => typeof n === 'number' && n > 0);
      return { projectId: result.project.id, diff };
    }

    // file (txt/epub/docx)
    const preview = await getImportService().createPreview(candidate.source_absolute_path);
    const result = getImportService().commitPreview({
      previewId: preview.previewId,
      projectTitle: candidate.predicted_title,
    });
    db.projects.updateSourceIdentity(result.project.id, {
      sourceIdentityKey: identityKey,
      sourceContentFingerprint: candidate.content_fingerprint,
      sourceFolderPath: null,
      sourceMode: 'LEGACY_IMPORT',
      watchFolderEnabled: false,
      title: candidate.predicted_title,
    });
    const chapters = db.chapters.listByProject(result.project.id);
    diff.chaptersCreated = chapters
      .map((c) => c.chapter_number)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    return { projectId: result.project.id, diff };
  }

  private async updateProject(
    projectId: string,
    candidate: BatchImportCandidateRow,
    identityKey: string,
    _ctx: { sourceKind: 'folder' | 'zip'; durableRoot: string | null },
  ): Promise<ReturnType<typeof emptyChapterDiff>> {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project || project.deleted_at) {
      throw new Error(`Target project not found: ${projectId}`);
    }

    if (candidate.kind === 'folder') {
      return this.updateFolderProject(projectId, candidate, identityKey);
    }

    return this.updateFileProject(projectId, candidate, identityKey);
  }

  private async updateFolderProject(
    projectId: string,
    candidate: BatchImportCandidateRow,
    identityKey: string,
  ): Promise<ReturnType<typeof emptyChapterDiff>> {
    const db = getDatabase();
    const project = db.projects.getById(projectId)!;
    const snapshots = db.chapters.listByProject(projectId).map((row) => {
      const translations = db.translations.listByChapter(row.id);
      const hasTranslation = translations.some((t) => t.status === 'translated');
      return chapterRowToSnapshot(row, hasTranslation);
    });

    const scanResult = await scanSourceFolder({
      folderPath: candidate.source_absolute_path,
      existingChapters: snapshots,
      expectedStartChapter: project.expected_start_chapter,
      expectedEndChapter: project.expected_end_chapter,
      sourceLanguage: project.source_language,
    });

    const diff = emptyChapterDiff();

    const applyEntry = (chapterNumber: number, bucket: 'created' | 'updated') => {
      const entry =
        scanResult.newChapters.find((c) => c.chapterNumber === chapterNumber) ??
        scanResult.modifiedChapters.find((c) => c.chapterNumber === chapterNumber);
      if (!entry) return;
      const fullPath = path.isAbsolute(entry.sourceFilePath)
        ? entry.sourceFilePath
        : path.join(candidate.source_absolute_path, entry.sourceFileName);
      const buffer = fs.readFileSync(fullPath);
      const stat = fs.statSync(fullPath);
      const detected = detectChapterFile({
        filePath: fullPath,
        buffer,
        stat,
        sourceLanguage: project.source_language,
      });
      const outcome = applyChapterSourceUpdateRespectingLocks({
        projectId,
        chapterNumber,
        detected: {
          chapterTitle: detected.chapterTitle,
          normalizedText: detected.normalizedText,
          sourceFilePath: fullPath,
          sourceFileName: detected.sourceFileName,
          sourceFileSize: detected.sourceFileSize,
          fileModifiedAt: detected.fileModifiedAt,
          sourceFileHash: detected.sourceFileHash,
          contentHash: detected.contentHash,
          encoding: detected.encoding,
          readError: detected.readError,
        },
      });
      if (outcome.outcome === 'created') diff.chaptersCreated.push(chapterNumber);
      else if (outcome.outcome === 'unchanged') diff.chaptersUnchanged.push(chapterNumber);
      else diff.chaptersUpdated.push(chapterNumber);
      diff.preservedLockedParagraphs += outcome.preservedLockedParagraphs;
      void bucket;
    };

    for (const entry of scanResult.newChapters) {
      if (entry.chapterNumber > 0) applyEntry(entry.chapterNumber, 'created');
    }
    for (const entry of scanResult.modifiedChapters) {
      if (entry.chapterNumber > 0) applyEntry(entry.chapterNumber, 'updated');
    }
    for (const entry of scanResult.existingUnchanged) {
      if (entry.chapterNumber > 0) diff.chaptersUnchanged.push(entry.chapterNumber);
    }
    for (const missing of scanResult.missingChapters) {
      db.chapters.markSourceMissing(missing.chapterId);
      diff.chaptersMissing.push(missing.chapterNumber);
    }

    db.projects.updateSourceIdentity(projectId, {
      sourceIdentityKey: identityKey,
      sourceContentFingerprint: candidate.content_fingerprint,
      sourceFolderPath: candidate.source_absolute_path,
      sourceMode: 'FOLDER',
      watchFolderEnabled: true,
      sourceFolderStatus: 'AVAILABLE',
      title: candidate.predicted_title || undefined,
    });
    db.projects.updateSourceFolderSettings(projectId, {
      last_folder_scan_at: utcNow(),
    });

    return diff;
  }

  private async updateFileProject(
    projectId: string,
    candidate: BatchImportCandidateRow,
    identityKey: string,
  ): Promise<ReturnType<typeof emptyChapterDiff>> {
    const db = getDatabase();
    const parsed = await parseImportFile(candidate.source_absolute_path);
    const normalizedText = normalizeNovelText(parsed.text);
    const detection = detectChapters(normalizedText);
    const diff = emptyChapterDiff();
    const seen = new Set<number>();
    const stat = await fsPromises.stat(candidate.source_absolute_path);
    const fileName = path.basename(candidate.source_absolute_path);

    for (const ch of detection.chapters) {
      seen.add(ch.chapterNumber);
      const contentHash = sha256Text(ch.body);
      const outcome = applyChapterSourceUpdateRespectingLocks({
        projectId,
        chapterNumber: ch.chapterNumber,
        detected: {
          chapterTitle: ch.title,
          normalizedText: ch.body,
          sourceFilePath: candidate.source_absolute_path,
          sourceFileName: fileName,
          sourceFileSize: stat.size,
          fileModifiedAt: new Date(stat.mtimeMs).toISOString(),
          sourceFileHash: `${stat.size}:${Math.floor(stat.mtimeMs)}`,
          contentHash,
          encoding: parsed.encoding ?? 'utf-8',
        },
      });
      if (outcome.outcome === 'created') diff.chaptersCreated.push(ch.chapterNumber);
      else if (outcome.outcome === 'unchanged') diff.chaptersUnchanged.push(ch.chapterNumber);
      else diff.chaptersUpdated.push(ch.chapterNumber);
      diff.preservedLockedParagraphs += outcome.preservedLockedParagraphs;
    }

    for (const row of db.chapters.listByProject(projectId)) {
      const num = row.chapter_number;
      if (typeof num === 'number' && num > 0 && !seen.has(num)) {
        db.chapters.markSourceMissing(row.id);
        diff.chaptersMissing.push(num);
      }
    }

    db.projects.updateSourceIdentity(projectId, {
      sourceIdentityKey: identityKey,
      sourceContentFingerprint: candidate.content_fingerprint,
      sourceMode: 'LEGACY_IMPORT',
      watchFolderEnabled: false,
      title: candidate.predicted_title || undefined,
    });

    return diff;
  }

  private computeSummary(sessionId: string): BatchImportSummary {
    const rows = getDatabase().batchImport.listCandidates(sessionId);
    const summary = emptySummary();
    summary.total = rows.length;
    for (const row of rows) {
      switch (row.status) {
        case 'CREATED':
          summary.created += 1;
          break;
        case 'UPDATED':
          summary.updated += 1;
          break;
        case 'SKIPPED':
          summary.skipped += 1;
          break;
        case 'SKIPPED_DUPLICATE':
          summary.skippedDuplicate += 1;
          break;
        case 'NEEDS_ATTENTION':
          summary.needsAttention += 1;
          break;
        case 'FAILED':
          summary.failed += 1;
          break;
        default:
          break;
      }
    }
    return summary;
  }

  private toSessionDetail(sessionId: string): BatchImportSessionDetailDto {
    const db = getDatabase();
    const session = db.batchImport.getSession(sessionId);
    if (!session) {
      throw new Error(`Batch import session not found: ${sessionId}`);
    }
    const candidates = db.batchImport.listCandidates(sessionId);
    return {
      sessionId: session.id,
      sourceKind: session.source_kind,
      sourceLabel: session.source_label,
      status: session.status,
      summary: parseSummary(session.summary_json),
      completedAt: session.completed_at,
      candidates: candidates.map((c) => this.toCandidateResult(c)),
    };
  }

  private toCandidateResult(row: BatchImportCandidateRow): BatchImportCandidateResultDto {
    const result = parseResultJson(row.result_json);
    const chaptersCreated = Array.isArray(result.chaptersCreated)
      ? (result.chaptersCreated as number[])
      : [];
    const chaptersUpdated = Array.isArray(result.chaptersUpdated)
      ? (result.chaptersUpdated as number[])
      : [];
    const chaptersMissing = Array.isArray(result.chaptersMissing)
      ? (result.chaptersMissing as number[])
      : [];
    const chaptersUnchanged = Array.isArray(result.chaptersUnchanged)
      ? (result.chaptersUnchanged as number[])
      : [];
    return {
      candidateId: row.id,
      displayPath: row.display_path,
      predictedTitle: row.predicted_title,
      kind: row.kind === 'folder' ? 'folder' : 'file',
      format: row.format,
      proposedAction: row.proposed_action,
      selected: row.selected === 1,
      status: row.status as BatchImportResultStatus,
      projectId: row.result_project_id,
      chaptersCreated,
      chaptersUpdated,
      chaptersMissing,
      chaptersUnchanged,
      preservedLockedParagraphs:
        typeof result.preservedLockedParagraphs === 'number'
          ? result.preservedLockedParagraphs
          : 0,
      errorCode: typeof result.errorCode === 'string' ? result.errorCode : null,
      errorMessage: row.error_message,
      nextAction: typeof result.nextAction === 'string' ? result.nextAction : null,
      attemptCount: row.attempt_count,
    };
  }
}
