import { dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BATCH_IMPORT_DEFAULT_LIMITS,
  BATCH_IMPORT_SESSION_TTL_MS,
  type BatchImportLimits,
  type BatchImportProposedAction,
  type BatchImportSourceKind,
} from '@shared/constants/batch-import';
import type {
  BatchImportCandidateDto,
  BatchImportPreflightDto,
  BatchImportProgressEventDto,
  BatchImportWarningDto,
} from '@shared/schemas/batch-import';
import { toSafeDisplayPath } from '@shared/utils/safe-display-path';
import { getDatabase } from '../db/connection';
import { newId } from '../db/utils/uuid';
import { pathsService } from '../services/paths-service';
import { analyzeDiscoveredCandidate, type AnalyzedCandidate } from './analyze-candidate';
import { discoverNovelCandidates, DiscoverCandidatesError } from './discover-candidates';
import {
  annotateCrossCandidateDuplicates,
  friendlyLimitWarning,
  proposeCandidateAction,
  type ExistingProjectMatch,
} from './propose-action';
import { SafeZipExtractError, safeExtractZip } from './safe-zip-extract';

export type BatchImportProgressSink = (event: BatchImportProgressEventDto) => void;

export interface SessionCandidate {
  candidateId: string;
  analyzed: AnalyzedCandidate;
  selected: boolean;
  predictedTitle: string;
  proposedAction: BatchImportProposedAction;
  matchedProjectId: string | null;
  matchedProjectTitle: string | null;
  targetProjectId: string | null;
  displayPath: string;
}

export interface PreflightSession {
  sessionId: string;
  sourceKind: BatchImportSourceKind;
  sourcePath: string;
  sourceLabel: string;
  scanRoot: string;
  tempDir: string | null;
  candidates: SessionCandidate[];
  scanWarnings: BatchImportWarningDto[];
  createdAt: number;
  abort: AbortController;
  finished: Promise<void>;
  markFinished: () => void;
}

function loadExistingProjects(): ExistingProjectMatch[] {
  try {
    return getDatabase()
      .projects.list()
      .map((p) => ({
        id: p.id,
        title: p.title,
        sourceFolderPath: p.source_folder_path,
        sourceIdentityKey: p.source_identity_key,
        sourceContentFingerprint: p.source_content_fingerprint,
      }));
  } catch {
    return [];
  }
}

export class BatchImportPreflightService {
  private readonly sessions = new Map<string, PreflightSession>();
  private activeSessionId: string | null = null;
  private progressSink: BatchImportProgressSink | null = null;
  private readonly limits: BatchImportLimits;

  constructor(limits?: Partial<BatchImportLimits>) {
    this.limits = { ...BATCH_IMPORT_DEFAULT_LIMITS, ...limits };
  }

  setProgressSink(sink: BatchImportProgressSink | null): void {
    this.progressSink = sink;
  }

  private emit(event: BatchImportProgressEventDto): void {
    this.progressSink?.(event);
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > BATCH_IMPORT_SESSION_TTL_MS) {
        void this.cleanupSession(session);
        this.sessions.delete(id);
      }
    }
  }

  private async cleanupSession(session: PreflightSession): Promise<void> {
    session.abort.abort();
    if (!session.tempDir) return;
    const target = session.tempDir;
    session.tempDir = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await fs.rm(target, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }

  async selectSource(preferredKind: BatchImportSourceKind = 'folder'): Promise<{
    canceled: boolean;
    sourceKind: BatchImportSourceKind | null;
    sourcePath: string | null;
  }> {
    if (preferredKind === 'folder') {
      const result = await dialog.showOpenDialog({
        title: 'Select folder of novels',
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, sourceKind: null, sourcePath: null };
      }
      return { canceled: false, sourceKind: 'folder', sourcePath: result.filePaths[0] };
    }

    const result = await dialog.showOpenDialog({
      title: 'Select ZIP of novels',
      properties: ['openFile'],
      filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, sourceKind: null, sourcePath: null };
    }
    const sourcePath = result.filePaths[0];
    if (!sourcePath.toLowerCase().endsWith('.zip')) {
      throw new Error('Please select a .zip file');
    }
    return { canceled: false, sourceKind: 'zip', sourcePath };
  }

  async scan(input: {
    sourceKind: BatchImportSourceKind;
    sourcePath: string;
  }): Promise<BatchImportPreflightDto> {
    this.purgeExpired();
    if (this.activeSessionId) {
      const prev = this.sessions.get(this.activeSessionId);
      if (prev) {
        await this.cleanupSession(prev);
        this.sessions.delete(this.activeSessionId);
      }
    }

    const sessionId = newId();
    const abort = new AbortController();
    const sourceLabel = path.basename(input.sourcePath);
    let tempDir: string | null = null;
    let scanRoot = input.sourcePath;

    let markFinished: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      markFinished = resolve;
    });
    const session: PreflightSession = {
      sessionId,
      sourceKind: input.sourceKind,
      sourcePath: input.sourcePath,
      sourceLabel,
      scanRoot,
      tempDir: null,
      candidates: [],
      scanWarnings: [],
      createdAt: Date.now(),
      abort,
      finished,
      markFinished,
    };
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    const emitProgress = (
      phase: BatchImportProgressEventDto['phase'],
      processed: number,
      total: number,
      currentLabel: string | null,
      message: string | null = null,
    ) => {
      this.emit({
        sessionId,
        phase,
        processed,
        total,
        currentLabel,
        message,
      });
    };

    try {
      emitProgress('preparing', 0, 1, sourceLabel);

      if (input.sourceKind === 'zip') {
        const cacheRoot = pathsService.getPath('cache');
        tempDir = path.join(cacheRoot, 'batch-import', sessionId);
        session.tempDir = tempDir;
        emitProgress('extracting', 0, 1, sourceLabel);
        try {
          const extracted = await safeExtractZip({
            zipPath: input.sourcePath,
            destinationDir: tempDir,
            limits: this.limits,
            signal: abort.signal,
            onProgress: (processed, total, entryName) => {
              emitProgress('extracting', processed, Math.max(total, 1), entryName || sourceLabel);
            },
          });
          scanRoot = extracted.extractedRoot;
          session.scanRoot = scanRoot;
        } catch (error) {
          if (error instanceof SafeZipExtractError) {
            throw new Error(friendlyZipMessage(error));
          }
          throw error;
        }
      }

      emitProgress('discovering', 0, 1, sourceLabel);
      let discovered;
      try {
        discovered = await discoverNovelCandidates(scanRoot, {
          limits: this.limits,
          signal: abort.signal,
        });
      } catch (error) {
        if (error instanceof DiscoverCandidatesError) {
          if (error.code === 'CANCELLED') throw new Error('Scan cancelled');
          session.scanWarnings.push(friendlyLimitWarning(error.message));
          throw new Error(error.message);
        }
        throw error;
      }

      if (discovered.length === 0) {
        session.scanWarnings.push({
          code: 'EMPTY_FOLDER',
          message: 'No novel candidates found in the selected source',
        });
      }

      const existing = loadExistingProjects();
      const analyzedList: AnalyzedCandidate[] = [];
      const total = discovered.length;

      for (let i = 0; i < discovered.length; i += 1) {
        if (abort.signal.aborted) throw new Error('Scan cancelled');
        const item = discovered[i];
        emitProgress('analyzing', i, total, item.label);
        const analyzed = await analyzeDiscoveredCandidate(item, abort.signal);
        analyzedList.push(analyzed);
        // Yield so main process stays responsive
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      annotateCrossCandidateDuplicates(analyzedList);

      session.candidates = analyzedList.map((analyzed) => {
        const proposal = proposeCandidateAction(analyzed, existing);
        const selected = proposal.proposedAction !== 'SKIP';
        return {
          candidateId: newId(),
          analyzed,
          selected,
          predictedTitle: analyzed.predictedTitle,
          proposedAction: proposal.proposedAction,
          matchedProjectId: proposal.matchedProjectId,
          matchedProjectTitle: proposal.matchedProjectTitle,
          targetProjectId: proposal.matchedProjectId,
          displayPath: toSafeDisplayPath(scanRoot, analyzed.absolutePath),
        };
      });

      emitProgress('done', total, total, null);
      return this.toDto(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Scan cancelled' || abort.signal.aborted) {
        emitProgress('cancelled', 0, 0, null, message);
        await this.cleanupSession(session);
        this.sessions.delete(sessionId);
        if (this.activeSessionId === sessionId) this.activeSessionId = null;
        throw new Error('Scan cancelled');
      }
      emitProgress('error', 0, 0, null, message);
      await this.cleanupSession(session);
      this.sessions.delete(sessionId);
      if (this.activeSessionId === sessionId) this.activeSessionId = null;
      throw error;
    } finally {
      session.markFinished();
    }
  }

  async cancel(sessionId?: string): Promise<{ ok: true; cancelled: boolean }> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return { ok: true, cancelled: false };
    const session = this.sessions.get(id);
    if (!session) return { ok: true, cancelled: false };
    this.emit({
      sessionId: id,
      phase: 'cancelled',
      processed: 0,
      total: 0,
      currentLabel: null,
      message: 'Scan cancelled',
    });
    session.abort.abort();
    await session.finished;
    await this.cleanupSession(session);
    this.sessions.delete(id);
    if (this.activeSessionId === id) this.activeSessionId = null;
    return { ok: true, cancelled: true };
  }

  async discard(sessionId: string): Promise<{ ok: true }> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await this.cleanupSession(session);
      this.sessions.delete(sessionId);
      if (this.activeSessionId === sessionId) this.activeSessionId = null;
    }
    return { ok: true };
  }

  updateCandidate(input: {
    sessionId: string;
    candidateId: string;
    selected?: boolean;
    predictedTitle?: string;
    proposedAction?: BatchImportProposedAction;
    targetProjectId?: string | null;
  }): BatchImportPreflightDto {
    const session = this.requireSession(input.sessionId);
    const candidate = session.candidates.find((c) => c.candidateId === input.candidateId);
    if (!candidate) {
      throw new Error(`Candidate not found: ${input.candidateId}`);
    }
    if (input.selected !== undefined) candidate.selected = input.selected;
    if (input.predictedTitle !== undefined) {
      candidate.predictedTitle = input.predictedTitle.trim() || candidate.predictedTitle;
    }
    if (input.proposedAction !== undefined) candidate.proposedAction = input.proposedAction;
    if (input.targetProjectId !== undefined) {
      candidate.targetProjectId = input.targetProjectId;
      if (input.targetProjectId) {
        const projects = loadExistingProjects();
        const match = projects.find((p) => p.id === input.targetProjectId);
        candidate.matchedProjectId = match?.id ?? input.targetProjectId;
        candidate.matchedProjectTitle = match?.title ?? candidate.matchedProjectTitle;
        if (candidate.proposedAction === 'CREATE') {
          candidate.proposedAction = 'UPDATE_EXISTING';
        }
      }
    }
    session.createdAt = Date.now();
    return this.toDto(session);
  }

  listProjectOptions(): { id: string; title: string }[] {
    return loadExistingProjects().map((p) => ({ id: p.id, title: p.title }));
  }

  /** Absolute paths for commit / tests — not exposed via IPC DTO. */
  getSessionForCommit(sessionId: string): PreflightSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Test helper — inspect session absolute paths without exposing via IPC DTO. */
  getSessionForTests(sessionId: string): PreflightSession | undefined {
    return this.getSessionForCommit(sessionId);
  }

  /** Release temp extract after durable materialization; keep memory until caller deletes. */
  async releaseTempAfterMaterialize(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.tempDir) return;
    const target = session.tempDir;
    session.tempDir = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await fs.rm(target, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }

  dropMemorySession(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) this.activeSessionId = null;
  }

  private requireSession(sessionId: string): PreflightSession {
    this.purgeExpired();
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Preflight session not found: ${sessionId}`);
    return session;
  }

  private toDto(session: PreflightSession): BatchImportPreflightDto {
    const candidates: BatchImportCandidateDto[] = session.candidates.map((c) => ({
      candidateId: c.candidateId,
      selected: c.selected,
      kind: c.analyzed.kind,
      format: c.analyzed.format,
      displayPath: c.displayPath,
      predictedTitle: c.predictedTitle,
      fileCount: c.analyzed.fileCount,
      chapterCount: c.analyzed.chapterCount,
      approximateCharCount: c.analyzed.approximateCharCount,
      languageCode: c.analyzed.languageCode,
      languageConfidence: c.analyzed.languageConfidence,
      contentFingerprint: c.analyzed.contentFingerprint,
      warnings: c.analyzed.warnings,
      proposedAction: c.proposedAction,
      matchedProjectId: c.matchedProjectId,
      matchedProjectTitle: c.matchedProjectTitle,
      targetProjectId: c.targetProjectId,
    }));
    return {
      sessionId: session.sessionId,
      sourceKind: session.sourceKind,
      sourceLabel: session.sourceLabel,
      candidateCount: candidates.length,
      selectedCount: candidates.filter((c) => c.selected).length,
      candidates,
      scanWarnings: session.scanWarnings,
    };
  }
}

function friendlyZipMessage(error: SafeZipExtractError): string {
  switch (error.code) {
    case 'ZIP_TRAVERSAL':
    case 'ZIP_ABSOLUTE_PATH':
      return 'ZIP rejected: unsafe path entry (possible zip-slip).';
    case 'ZIP_SYMLINK':
      return 'ZIP rejected: symlinks are not allowed.';
    case 'ZIP_TOO_MANY_ENTRIES':
      return 'ZIP rejected: too many entries (archive bomb protection).';
    case 'ZIP_ENTRY_TOO_LARGE':
    case 'ZIP_UNCOMPRESSED_TOO_LARGE':
      return 'ZIP rejected: uncompressed size exceeds safety limit.';
    case 'ZIP_DEPTH_EXCEEDED':
      return 'ZIP rejected: directory depth exceeds safety limit.';
    case 'ZIP_CANCELLED':
      return 'Scan cancelled';
    default:
      return error.message || 'Invalid ZIP archive';
  }
}
