import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseManager } from '../db/database-manager';
import type { FullNovelPreprocessRunRow } from '../db/repositories/full-novel-preprocess-repository';
import {
  FULL_PREPROCESS_SOURCE_INDEX_TIMEOUT_MS,
  FULL_PREPROCESS_SOURCE_POLL_MS,
  isStageAtLeast,
  type FullNovelPreprocessStage,
} from '@shared/constants/full-novel-preprocess';
import { PREPROCESS_GENERATION_MAX_TIMEOUT_MS, formatCorrelationMarker } from '@shared/constants/gemini';
import { AutomationError } from '../automation/errors/automation-errors';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { pathsService } from '../services/paths-service';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import { FullNovelPreprocessService } from './full-novel-preprocess-service';
import { buildFullNovelPreprocessPrompt } from './full-novel-preprocess-prompts';
import {
  clearAutoPreprocessProgress,
  setAutoPreprocessProgress,
} from './auto-preprocess-progress';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import type { AutoPreprocessResult } from './auto-preprocess-progress';
import type { AutoPreprocessStep } from '@shared/constants/notebooklm-preprocess-auto';
import type { FullNovelPreprocessProgressSnapshot } from '../db/repositories/full-novel-preprocess-repository';
import { resolveProjectWorker } from '../services/project-worker-resolver';
import { findUserMessageWithMarker } from '../automation/providers/google/response-anchor';
import {
  getNotebookLayout,
  resolveResearchNotebook,
  resolveTranslationNotebook,
} from '../notebook/notebook-resolver';

export interface FullOrchestratorOptions {
  forceNewRun?: boolean;
  googleAccountId?: string | null;
  headless?: boolean;
  /** Source indexing timeout for FULL (default 20 min). */
  sourceIndexTimeoutMs?: number;
}

function stageToUiStep(stage: FullNovelPreprocessStage): AutoPreprocessStep {
  switch (stage) {
    case 'PACKING':
      return 'packing';
    case 'NOTEBOOK_READY':
      return 'ensuring_notebook';
    case 'SOURCES_UPLOADING':
    case 'SOURCES_UPLOADED':
    case 'SOURCES_INDEXING':
    case 'SOURCES_READY':
      return 'uploading';
    case 'ANALYSIS_SENT':
    case 'ANALYSIS_RUNNING':
      return 'analyzing';
    case 'RESPONSE_CAPTURED':
    case 'RESPONSE_PARSED':
    case 'KNOWLEDGE_IMPORTED':
      return 'importing';
    case 'COMPLETED':
      return 'done';
    case 'FAILED':
      return 'failed';
    default:
      return 'packing';
  }
}

export class FullNovelPreprocessOrchestrator {
  constructor(private readonly db: DatabaseManager) {}

  async run(
    projectId: string,
    options: FullOrchestratorOptions = {},
  ): Promise<AutoPreprocessResult> {
    const steps: string[] = [];
    const push = (
      stage: FullNovelPreprocessStage,
      message: string,
      snap?: FullNovelPreprocessProgressSnapshot | null,
    ) => {
      const ui = stageToUiStep(stage);
      steps.push(`${stage}: ${message}`);
      setAutoPreprocessProgress(projectId, ui, message, 'full', {
        stage,
        packingDone: snap?.packingDone,
        packingTotal: snap?.packingTotal,
        sourcesUploaded: snap?.sourcesUploaded,
        sourcesTotal: snap?.sourcesTotal,
        sourcesReady: snap?.sourcesReady,
        sourcesIndexing: snap?.sourcesIndexing,
        sourcesError: snap?.sourcesError,
      });
    };

    const accountId = this.resolveAccountId(projectId, options.googleAccountId);
    if (!accountId) {
      push('FAILED', 'Chưa có tài khoản Google.');
      clearAutoPreprocessProgress(projectId);
      return {
        mode: 'full',
        status: 'failed',
        message: 'Chưa có tài khoản Google. Thêm tài khoản rồi thử lại.',
        foundKeys: [],
        needsAssisted: true,
        steps,
        accountId: null,
      };
    }

    const repo = this.db.fullNovelPreprocess;
    let run =
      !options.forceNewRun ? repo.getActiveRun(projectId) : null;
    if (!run) {
      run = repo.createRun({
        project_id: projectId,
        google_account_id: accountId,
        stage: 'PACKING',
      });
    } else {
      repo.setStage(run.id, run.stage, { google_account_id: accountId });
      run = repo.getRunById(run.id) ?? run;
      push(run.stage, `Tiếp tục từ stage ${run.stage}`, repo.parseProgress(run));
    }

    const preprocess = new FullNovelPreprocessService(this.db);

    try {
      // ——— Offline / parse-only resume ———
      if (
        isStageAtLeast(run.stage, 'RESPONSE_CAPTURED') &&
        !isStageAtLeast(run.stage, 'KNOWLEDGE_IMPORTED') &&
        run.raw_response_path &&
        fs.existsSync(run.raw_response_path)
      ) {
        return await this.resumeFromRaw(projectId, run.id, accountId, steps, push);
      }

      // ——— PACKING ———
      if (!isStageAtLeast(run.stage, 'NOTEBOOK_READY')) {
        push('PACKING', 'Đang đóng gói corpus…');
        const packed = preprocess.packCorpus(projectId);
        const total = packed.parts.length;
        for (let i = 0; i < packed.parts.length; i++) {
          const p = packed.parts[i];
          repo.upsertPart({
            run_id: run.id,
            part_index: i,
            file_name: p.fileName,
            file_path: p.filePath,
            content_hash: p.contentHash,
            chapter_from: p.chapterFrom,
            chapter_to: p.chapterTo,
            notebook_source_name: p.fileName,
          });
          const snap: FullNovelPreprocessProgressSnapshot = {
            packingDone: i + 1,
            packingTotal: total,
            sourcesUploaded: 0,
            sourcesTotal: total,
            sourcesReady: 0,
            sourcesIndexing: 0,
            sourcesError: 0,
            message: `Đóng gói ${i + 1}/${total}`,
          };
          repo.setStage(run.id, 'PACKING', { output_dir: packed.outputDir, progress: snap });
          push('PACKING', snap.message ?? '', snap);
        }
        const snap: FullNovelPreprocessProgressSnapshot = {
          packingDone: total,
          packingTotal: total,
          sourcesUploaded: 0,
          sourcesTotal: total,
          sourcesReady: 0,
          sourcesIndexing: 0,
          sourcesError: 0,
          message: `Đóng gói ${total}/${total}`,
        };
        run = repo.setStage(run.id, 'NOTEBOOK_READY', {
          output_dir: packed.outputDir,
          progress: snap,
        });
        push('NOTEBOOK_READY', 'Đóng gói xong — đảm bảo Notebook…', snap);
      }

      // ——— NOTEBOOK_READY ———
      if (!isStageAtLeast(run.stage, 'SOURCES_UPLOADING')) {
        const ensure = await this.ensureNotebook(projectId, accountId);
        if (ensure.needsAssisted) {
          repo.setStage(run.id, run.stage, { error_message: ensure.message });
          push('FAILED', ensure.message);
          await this.openAssistedBrowser(accountId);
          clearAutoPreprocessProgress(projectId);
          return {
            mode: 'full',
            status: 'needs_assisted',
            message: ensure.message,
            foundKeys: [],
            needsAssisted: true,
            steps,
            accountId,
          };
        }
        run = repo.setStage(run.id, 'SOURCES_UPLOADING');
        push('SOURCES_UPLOADING', 'Notebook sẵn sàng — bắt đầu tải nguồn…');
      }

      const project = this.db.projects.getById(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const parts = repo.listParts(run.id);
      if (parts.length === 0) {
        throw new Error('Preprocess run has no corpus parts — re-run packing');
      }
      const partNames = parts.map((p) => p.file_name);
      const prompt = buildFullNovelPreprocessPrompt({
        projectTitle: project.title,
        author: project.author_name,
        genre: project.genre,
        partFileNames: partNames,
        sourceLanguage: project.source_language,
        targetLanguage: project.target_language,
      });
      const promptHash = createHash('sha256').update(prompt, 'utf8').digest('hex');

      // ——— Browser stages: upload → index → analyze → capture ———
      if (!isStageAtLeast(run.stage, 'RESPONSE_CAPTURED')) {
        const rawText = await this.runBrowserStages({
          projectId,
          accountId,
          runId: run.id,
          prompt,
          promptHash,
          headless: options.headless,
          sourceIndexTimeoutMs:
            options.sourceIndexTimeoutMs ?? FULL_PREPROCESS_SOURCE_INDEX_TIMEOUT_MS,
          onProgress: (stage, message, snap) => {
            push(stage, message, snap);
          },
        });

        run = repo.getRunById(run.id) ?? run;
        if (!run.raw_response_path || !fs.existsSync(run.raw_response_path)) {
          // Persist raw before parse (also done inside browser stages)
          const rawPath = this.persistRaw(projectId, run.correlation_id ?? newId(), rawText);
          run = repo.setStage(run.id, 'RESPONSE_CAPTURED', {
            raw_response_path: rawPath,
            progress: {
              packingDone: parts.length,
              packingTotal: parts.length,
              sourcesUploaded: parts.length,
              sourcesTotal: parts.length,
              sourcesReady: parts.length,
              sourcesIndexing: 0,
              sourcesError: 0,
              message: 'Đã lưu phản hồi thô',
            },
          });
        }
      }

      return await this.resumeFromRaw(projectId, run.id, accountId, steps, push);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const assisted = this.isAssistedError(err);
      const latest = repo.getRunById(run.id) ?? run;
      // Keep stage so retry resumes (part hash skip / correlation / raw parse).
      repo.setStage(latest.id, latest.stage, { error_message: message });
      push('FAILED', message);
      if (assisted) {
        await this.openAssistedBrowser(accountId);
        clearAutoPreprocessProgress(projectId);
        return {
          mode: 'full',
          status: 'needs_assisted',
          message,
          foundKeys: [],
          needsAssisted: true,
          steps,
          accountId,
        };
      }
      clearAutoPreprocessProgress(projectId);
      return {
        mode: 'full',
        status: 'failed',
        message,
        foundKeys: [],
        needsAssisted: false,
        steps,
        accountId,
      };
    }
  }

  private async resumeFromRaw(
    projectId: string,
    runId: string,
    accountId: string,
    steps: string[],
    push: (
      stage: FullNovelPreprocessStage,
      message: string,
      snap?: FullNovelPreprocessProgressSnapshot | null,
    ) => void,
  ): Promise<AutoPreprocessResult> {
    const repo = this.db.fullNovelPreprocess;
    let run = repo.getRunById(runId);
    if (!run) throw new Error(`Preprocess run not found: ${runId}`);
    const rawPath = run.raw_response_path;
    if (!rawPath || !fs.existsSync(rawPath)) {
      throw new Error('Raw response missing — cannot parse; re-run analysis');
    }
    const rawText = fs.readFileSync(rawPath, 'utf8');
    push('RESPONSE_CAPTURED', 'Parse lại từ raw đã lưu…');

    const preprocess = new FullNovelPreprocessService(this.db);
    let imported: ReturnType<FullNovelPreprocessService['importResult']>;
    try {
      imported = preprocess.importResult(projectId, {
        text: rawText,
        temporalProvenance: true,
      });
      run = repo.setStage(runId, 'RESPONSE_PARSED');
      push('RESPONSE_PARSED', 'Parse 00–07 OK');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      repo.setStage(runId, 'RESPONSE_CAPTURED', { error_message: message });
      push('FAILED', `Parse thất bại — raw giữ nguyên, thử lại parse. ${message}`);
      clearAutoPreprocessProgress(projectId);
      return {
        mode: 'full',
        status: 'failed',
        message: `Phản hồi NotebookLM không đủ 00–07. Raw đã lưu tại ${rawPath}. ${message}`,
        foundKeys: [],
        needsAssisted: false,
        steps,
        accountId,
      };
    }

    run = repo.setStage(runId, 'KNOWLEDGE_IMPORTED');
    push('KNOWLEDGE_IMPORTED', 'Đã import knowledge');

    push('KNOWLEDGE_IMPORTED', 'Đồng bộ Translation Notebook…');
    try {
      await this.ensureTranslationNotebook(projectId, accountId);
      await getNotebookSyncService(this.db).syncDrive(projectId);
    } catch (err) {
      logger.warn('Full preprocess: Translation notebook sync deferred', {
        err: err instanceof Error ? err.message : String(err),
        projectId,
      });
    }

    repo.setStage(runId, 'COMPLETED', { error_message: null });
    push('COMPLETED', imported.message);
    clearAutoPreprocessProgress(projectId);
    return {
      mode: 'full',
      status: 'completed',
      message: imported.message,
      foundKeys: imported.foundKeys,
      needsAssisted: false,
      steps,
      accountId,
    };
  }

  private persistRaw(projectId: string, correlationId: string, text: string): string {
    const dir = path.join(
      pathsService.getPath('exports'),
      'preprocess',
      projectId,
      'raw',
    );
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${correlationId}.md`);
    fs.writeFileSync(filePath, text, 'utf8');
    return filePath;
  }

  private async runBrowserStages(input: {
    projectId: string;
    accountId: string;
    runId: string;
    prompt: string;
    promptHash: string;
    headless?: boolean;
    sourceIndexTimeoutMs: number;
    onProgress: (
      stage: FullNovelPreprocessStage,
      message: string,
      snap?: FullNovelPreprocessProgressSnapshot | null,
    ) => void;
  }): Promise<string> {
    const repo = this.db.fullNovelPreprocess;
    const initialRun = repo.getRunById(input.runId);
    if (!initialRun) throw new Error(`Preprocess run not found: ${input.runId}`);
    let run: FullNovelPreprocessRunRow = initialRun;
    const mapping = resolveResearchNotebook(
      this.db,
      input.projectId,
      input.accountId,
    );
    if (!mapping?.resource_url) {
      throw new Error('Research Notebook mapping missing resource_url');
    }

    const profile = this.db.googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for worker');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);

    try {
      const { getAccountWorkerService } = await import('../services/account-worker-singleton');
      await getAccountWorkerService().closeBrowser(input.accountId);
    } catch {
      // ignore
    }
    try {
      const { getBrowserRuntimeManager } = await import(
        '../automation/browser-runner/browser-runtime-manager'
      );
      await getBrowserRuntimeManager().evictForExternalLaunch(input.accountId);
    } catch {
      // ignore
    }
    profileLockManager.recoverIfStale(profilePath);

    const ownerId = `preprocess:${input.projectId}`;
    profileLockManager.acquireLease({
      profilePath,
      ownerId,
      accountId: input.accountId,
      operation: 'full_preprocess',
      label: 'Khởi tạo AI memory (full preprocess)',
    });
    const { startLeaseHeartbeat } = await import('../automation/browser-runner/profile-lock');
    const stopHeartbeat = startLeaseHeartbeat(profileLockManager, {
      profilePath,
      ownerId,
    });

    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'preprocess',
    );
    const eventLogDir = path.join(diagnosticsDir, 'events');
    const eventLogger = new BrowserEventLogger(this.db.automationEvents, eventLogDir);
    const workerState = this.db.workerStates.getByAccountId(input.accountId);

    const { getBrowserRuntimeManager } = await import(
      '../automation/browser-runner/browser-runtime-manager'
    );
    const runtimeManager = getBrowserRuntimeManager();

    try {
      return await runtimeManager.runExclusive(
        {
          accountId: input.accountId,
          profilePath,
          diagnosticsDir,
          headless: input.headless,
          nestUnderExternalLock: true,
        },
        async ({ runtime, prepareNotebook }) => {
          const page = await prepareNotebook({
            projectId: input.projectId,
            notebookUrl: mapping.resource_url ?? '',
            openNotebook: async (p, url) => {
              const notebook = new NotebookProvider({ diagnosticsDir });
              notebook.attachPage(p);
              if (url.startsWith('http')) {
                await p.goto(url, {
                  waitUntil: 'domcontentloaded',
                  timeout: 45_000,
                });
              } else {
                await notebook.ensureNotebook(mapping.notebook_name ?? input.projectId);
                await notebook.openNotebook(mapping.notebook_name ?? input.projectId);
              }
            },
          });

          const notebook = new NotebookProvider({ diagnosticsDir });
          notebook.attachPage(page);
          const parts = repo.listParts(input.runId);
          const snapBase = (): FullNovelPreprocessProgressSnapshot => {
            const list = repo.listParts(input.runId);
            return {
              packingDone: list.length,
              packingTotal: list.length,
              sourcesUploaded: list.filter(
                (p) =>
                  p.source_status === 'UPLOADED' ||
                  p.source_status === 'READY' ||
                  p.source_status === 'SKIPPED' ||
                  p.source_status === 'PROCESSING',
              ).length,
              sourcesTotal: list.length,
              sourcesReady: list.filter(
                (p) => p.source_status === 'READY' || p.source_status === 'SKIPPED',
              ).length,
              sourcesIndexing: list.filter((p) => p.source_status === 'PROCESSING').length,
              sourcesError: list.filter((p) => p.source_status === 'ERROR').length,
            };
          };

          // ——— Upload (skip hash-matched READY / existing names) ———
          if (!isStageAtLeast(run.stage, 'SOURCES_UPLOADED')) {
            run = repo.setStage(input.runId, 'SOURCES_UPLOADING', {
              prompt_hash: input.promptHash,
            });
            const existingNames = await notebook.readSourceNames();
            const toUpload: string[] = [];
            for (const part of parts) {
              const present = existingNames.some(
                (n) =>
                  n.toLowerCase().includes(part.file_name.toLowerCase().replace(/\.[^.]+$/, '')) ||
                  n.toLowerCase().includes(part.file_name.toLowerCase()),
              );
              if (present) {
                repo.updatePartStatus(part.id, 'UPLOADED', {
                  notebook_source_name: part.file_name,
                  last_error: null,
                });
                continue;
              }
              if (
                part.source_status === 'READY' ||
                part.source_status === 'SKIPPED'
              ) {
                continue;
              }
              toUpload.push(part.file_path);
            }

            if (toUpload.length > 0) {
              input.onProgress(
                'SOURCES_UPLOADING',
                `Tải nguồn ${snapBase().sourcesUploaded}/${parts.length}`,
                { ...snapBase(), message: `Tải nguồn ${snapBase().sourcesUploaded}/${parts.length}` },
              );
              const result = await notebook.addFileSources(toUpload);
              for (const name of result.added) {
                const part = parts.find((p) => p.file_name === name);
                if (part) {
                  repo.updatePartStatus(part.id, 'UPLOADED', {
                    notebook_source_name: name,
                    last_error: null,
                  });
                }
              }
              for (const name of result.skipped) {
                const part = parts.find((p) => p.file_name === name);
                if (part) {
                  repo.updatePartStatus(part.id, 'SKIPPED', {
                    notebook_source_name: name,
                  });
                }
              }
            }

            // Mark remaining pending that somehow exist
            for (const part of repo.listParts(input.runId)) {
              if (part.source_status === 'PENDING') {
                repo.updatePartStatus(part.id, 'UPLOADED');
              }
            }

            const snap = {
              ...snapBase(),
              message: `Đã tải ${snapBase().sourcesUploaded}/${parts.length}`,
            };
            run = repo.setStage(input.runId, 'SOURCES_UPLOADED', { progress: snap });
            input.onProgress('SOURCES_UPLOADED', snap.message, snap);
          }

          // ——— Indexing ———
          if (!isStageAtLeast(run.stage, 'SOURCES_READY')) {
            run = repo.setStage(input.runId, 'SOURCES_INDEXING');
            const requiredNames = repo
              .listParts(input.runId)
              .filter((p) => p.source_status !== 'SKIPPED')
              .map((p) => p.notebook_source_name ?? p.file_name);

            for (const part of repo.listParts(input.runId)) {
              if (part.source_status === 'UPLOADED' || part.source_status === 'PENDING') {
                repo.updatePartStatus(part.id, 'PROCESSING');
              }
            }

            await notebook.waitForNamedSourcesReady(requiredNames, {
              timeoutMs: input.sourceIndexTimeoutMs,
              pollMs: FULL_PREPROCESS_SOURCE_POLL_MS,
              onProgress: (s) => {
                for (const st of s.statuses) {
                  const part = repo
                    .listParts(input.runId)
                    .find(
                      (p) =>
                        p.file_name === st.name ||
                        p.notebook_source_name === st.name,
                    );
                  if (!part) continue;
                  if (st.status === 'READY') {
                    repo.updatePartStatus(part.id, 'READY', { last_error: null });
                  } else if (st.status === 'PROCESSING') {
                    repo.updatePartStatus(part.id, 'PROCESSING');
                  } else if (st.status === 'ERROR') {
                    repo.updatePartStatus(part.id, 'ERROR', {
                      last_error: 'Notebook source ERROR',
                    });
                  } else if (st.status === 'UPLOADED' && st.present) {
                    repo.updatePartStatus(part.id, 'UPLOADED');
                  }
                }
                const snap = {
                  ...snapBase(),
                  sourcesReady: s.ready,
                  sourcesIndexing: s.processing,
                  sourcesUploaded: s.ready + s.processing + s.uploaded,
                  sourcesError: s.error,
                  message: `Notebook xử lý ${s.ready}/${s.total}`,
                };
                repo.setStage(input.runId, 'SOURCES_INDEXING', { progress: snap });
                input.onProgress('SOURCES_INDEXING', snap.message, snap);
              },
            });

            for (const part of repo.listParts(input.runId)) {
              if (part.source_status === 'PROCESSING' || part.source_status === 'UPLOADED') {
                repo.updatePartStatus(part.id, 'READY');
              }
            }

            if (!repo.allPartsReady(input.runId)) {
              const bad = repo
                .listParts(input.runId)
                .filter((p) => p.source_status === 'ERROR');
              if (bad.length > 0) {
                throw new Error(
                  `Corpus part lỗi — retry đúng part: ${bad.map((b) => b.file_name).join(', ')}`,
                );
              }
              throw new Error('Not all corpus sources READY');
            }

            const snap = {
              ...snapBase(),
              message: `Nguồn sẵn sàng ${parts.length}/${parts.length}`,
            };
            run = repo.setStage(input.runId, 'SOURCES_READY', { progress: snap });
            input.onProgress('SOURCES_READY', snap.message, snap);
          }

          // Only send analysis when sources READY
          if (!repo.allPartsReady(input.runId) && !isStageAtLeast(run.stage, 'ANALYSIS_SENT')) {
            throw new Error('Refuse analysis: required sources not READY');
          }

          const gemini = new GeminiBrowserProvider({
            diagnosticsDir,
            eventLogger,
            workerId: workerState?.id ?? null,
            maxTimeoutMs: PREPROCESS_GENERATION_MAX_TIMEOUT_MS,
          });
          gemini.attachPage(page);

          let correlationId = run.correlation_id;
          const alreadySent = isStageAtLeast(run.stage, 'ANALYSIS_SENT') && Boolean(correlationId);

          if (alreadySent && correlationId) {
            const marker = formatCorrelationMarker(correlationId);
            const existing = await findUserMessageWithMarker(page, marker);
            if (existing) {
              logger.info('preprocess_skip_double_send', {
                correlationId,
                projectId: input.projectId,
              });
              input.onProgress('ANALYSIS_SENT', 'Prompt đã gửi trước đó — không gửi lại');
            } else {
              // Marker missing on page — do not re-send if stage says sent; try extract only
              logger.warn('preprocess_correlation_marker_missing_on_resume', {
                correlationId,
              });
            }
          } else {
            runtime.setGenerationState('GENERATING');
            await gemini.createOrOpenTranslationThread({ forceNew: true });
            correlationId = newId();
            input.onProgress('ANALYSIS_SENT', 'Đang phân tích…');
            await gemini.submitPlainPrompt(input.prompt, correlationId);
            run = repo.setStage(input.runId, 'ANALYSIS_SENT', {
              correlation_id: correlationId,
              prompt_hash: input.promptHash,
              progress: { ...snapBase(), message: 'Đang phân tích…' },
            });
            input.onProgress('ANALYSIS_SENT', 'Đã gửi prompt phân tích');
          }

          run = repo.setStage(input.runId, 'ANALYSIS_RUNNING', {
            correlation_id: correlationId,
          });
          input.onProgress('ANALYSIS_RUNNING', 'Đang phân tích…');

          if (!alreadySent) {
            await gemini.waitForGenerationStart();
          }
          runtime.setGenerationState('STABILIZING');
          await gemini.waitForGenerationComplete(correlationId, {
            maxTimeoutMs: PREPROCESS_GENERATION_MAX_TIMEOUT_MS,
          });
          const raw = await gemini.extractLatestResponse(correlationId);
          runtime.setGenerationState('IDLE');

          const rawPath = this.persistRaw(input.projectId, correlationId, raw.text);
          run = repo.setStage(input.runId, 'RESPONSE_CAPTURED', {
            correlation_id: correlationId,
            raw_response_path: rawPath,
            progress: { ...snapBase(), message: 'Đã lưu phản hồi thô' },
          });
          input.onProgress('RESPONSE_CAPTURED', 'Đã lưu phản hồi thô');

          await gemini.detach();
          return raw.text;
        },
      );
    } finally {
      stopHeartbeat();
      try {
        profileLockManager.releaseLease(profilePath, ownerId);
      } catch {
        profileLockManager.recoverIfStale(profilePath);
      }
      runtimeManager.adoptRuntimeLockIfNeeded(input.accountId, profilePath);
    }
  }

  private async ensureNotebook(
    projectId: string,
    accountId: string,
  ): Promise<{ needsAssisted: boolean; message: string }> {
    const mapping = resolveResearchNotebook(this.db, projectId, accountId);
    const hasUrl = Boolean(mapping?.resource_url?.startsWith('http'));
    const ready =
      mapping &&
      (mapping.status === 'ready' ||
        mapping.status === 'sync_pending' ||
        mapping.status === 'stale');
    if (ready && hasUrl) {
      return { needsAssisted: false, message: 'Research Notebook ready' };
    }

    const layout = getNotebookLayout(this.db, projectId, accountId);
    const role = layout === 'SINGLE' ? 'SINGLE' : 'RESEARCH';

    const { getNotebookService } = await import('../services/notebook-service-singleton');
    const result = await getNotebookService().provision({
      projectId,
      accountId,
      headless: false,
      role,
    });
    if (result.assisted) {
      return {
        needsAssisted: true,
        message:
          result.message || 'Cần hoàn tất thiết lập Research Notebook trên trình duyệt.',
      };
    }
    const after = resolveResearchNotebook(this.db, projectId, accountId);
    if (!after?.resource_url?.startsWith('http')) {
      return {
        needsAssisted: true,
        message:
          'Research Notebook chưa có URL. Mở Bộ nhớ AI → Research Notebook, rồi thử lại.',
      };
    }
    return { needsAssisted: false, message: result.message };
  }

  private async ensureTranslationNotebook(
    projectId: string,
    accountId: string,
  ): Promise<void> {
    const layout = getNotebookLayout(this.db, projectId, accountId);
    if (layout === 'SINGLE') return;

    const mapping = resolveTranslationNotebook(this.db, projectId, accountId);
    const ready =
      mapping &&
      (mapping.status === 'ready' ||
        mapping.status === 'sync_pending' ||
        mapping.status === 'stale');
    if (ready) return;

    const { getNotebookService } = await import('../services/notebook-service-singleton');
    const result = await getNotebookService().provision({
      projectId,
      accountId,
      headless: false,
      role: 'TRANSLATION',
    });
    if (result.assisted) {
      logger.warn('Translation notebook needs assisted setup after FULL import', {
        projectId,
        message: result.message,
      });
    }
  }

  private resolveAccountId(
    projectId: string,
    preferred?: string | null,
  ): string | null {
    // Explicit caller override (UI / auto preprocess options).
    if (preferred && this.db.googleAccounts.getById(preferred)) return preferred;
    return resolveProjectWorker(this.db, {
      projectId,
      purpose: 'preprocess',
    }).accountId;
  }

  private isAssistedError(err: unknown): boolean {
    if (!(err instanceof AutomationError)) return false;
    return (
      err.code === 'LOGIN_REQUIRED' ||
      err.code === 'SELECTOR_NOT_FOUND' ||
      err.code === 'CAPTCHA' ||
      err.code === 'UNKNOWN_UI'
    );
  }

  private async openAssistedBrowser(accountId: string): Promise<void> {
    try {
      const { getAccountWorkerService } = await import('../services/account-worker-singleton');
      await getAccountWorkerService().openBrowser(accountId, 'notebook');
    } catch (err) {
      logger.warn('Could not open assisted Notebook browser', {
        err: err instanceof Error ? err.message : String(err),
        accountId,
      });
    }
  }
}
