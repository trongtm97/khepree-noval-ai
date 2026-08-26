import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { decidePreprocessMode } from '@shared/constants/notebooklm-preprocess-auto';
import { PREPROCESS_GENERATION_MAX_TIMEOUT_MS } from '@shared/constants/gemini';
import { AutomationError } from '../automation/errors/automation-errors';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { NotebookProvider } from '../automation/providers/google/notebook-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { pathsService } from '../services/paths-service';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import { BootstrapAnalysisService } from './bootstrap-analysis-service';
import { FullNovelPreprocessService } from './full-novel-preprocess-service';
import { buildFullNovelPreprocessPrompt } from './full-novel-preprocess-prompts';
import {
  clearAutoPreprocessProgress,
  setAutoPreprocessProgress,
} from './auto-preprocess-progress';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';

export interface AutoPreprocessResult {
  mode: 'quick' | 'full';
  status: 'completed' | 'completed_with_warnings' | 'failed' | 'needs_assisted';
  message: string;
  foundKeys: string[];
  needsAssisted: boolean;
  steps: string[];
  accountId: string | null;
}

export interface AutoPreprocessRunOptions {
  forceFull?: boolean;
  googleAccountId?: string | null;
  headless?: boolean;
}

/**
 * One-click AI memory init: Quick bootstrap OR full NotebookLM auto pipeline.
 */
export class FullNovelPreprocessAutoService {
  constructor(private readonly db: DatabaseManager) {}

  async run(
    projectId: string,
    options: AutoPreprocessRunOptions = {},
  ): Promise<AutoPreprocessResult> {
    const project = this.db.projects.getById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const steps: string[] = [];
    const push = (step: Parameters<typeof setAutoPreprocessProgress>[1], message: string, mode?: 'quick' | 'full') => {
      steps.push(`${step}: ${message}`);
      setAutoPreprocessProgress(projectId, step, message, mode ?? null);
    };

    try {
      push('deciding', 'Đang chọn chế độ khởi tạo…');
      const chapters = this.db.chapters
        .listByProject(projectId)
        .filter((c) => c.source_status === 'SOURCE_READY' && (c.source_text?.trim() ?? '').length > 0);
      const totalChars = chapters.reduce((n, c) => n + (c.source_text?.length ?? 0), 0);
      const mode = decidePreprocessMode({
        chapterCount: chapters.length,
        totalChars,
        forceFull: options.forceFull,
      });
      push('deciding', `Chế độ: ${mode} (${chapters.length} chương, ~${totalChars} ký tự)`, mode);

      if (mode === 'quick') {
        return await this.runQuick(projectId, options.googleAccountId, steps, push);
      }
      return await this.runFull(projectId, options, steps, push);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      push('failed', message);
      clearAutoPreprocessProgress(projectId);
      return {
        mode: 'full',
        status: 'failed',
        message,
        foundKeys: [],
        needsAssisted: false,
        steps,
        accountId: options.googleAccountId ?? null,
      };
    }
  }

  private async runQuick(
    projectId: string,
    googleAccountId: string | null | undefined,
    steps: string[],
    push: (step: Parameters<typeof setAutoPreprocessProgress>[1], message: string, mode?: 'quick' | 'full') => void,
  ): Promise<AutoPreprocessResult> {
    push('analyzing', 'Đang phân tích bootstrap (quick)…', 'quick');
    const accountId = this.resolveAccountId(projectId, googleAccountId);
    const result = await new BootstrapAnalysisService(this.db).run(
      projectId,
      {
        sendPrompt: (pack, opts) =>
          import('../ai/ai-provider-singleton').then(({ getAiProviderService }) =>
            getAiProviderService().manager.sendWithFallback(pack, opts),
          ),
        googleAccountId: accountId,
      },
      { mode: 'BALANCED' },
    );

    push('syncing', 'Đồng bộ Drive…', 'quick');
    try {
      await getNotebookSyncService(this.db).syncDrive(projectId);
    } catch (err) {
      logger.warn('Quick preprocess: Drive sync deferred', {
        err: err instanceof Error ? err.message : String(err),
        projectId,
      });
    }

    push('done', result.message, 'quick');
    clearAutoPreprocessProgress(projectId);
    return {
      mode: 'quick',
      status:
        result.status === 'FAILED'
          ? 'failed'
          : result.warnings.length > 0
            ? 'completed_with_warnings'
            : 'completed',
      message: result.message,
      foundKeys: [],
      needsAssisted: false,
      steps,
      accountId,
    };
  }

  private async runFull(
    projectId: string,
    options: AutoPreprocessRunOptions,
    steps: string[],
    push: (step: Parameters<typeof setAutoPreprocessProgress>[1], message: string, mode?: 'quick' | 'full') => void,
  ): Promise<AutoPreprocessResult> {
    const accountId = this.resolveAccountId(projectId, options.googleAccountId);
    if (!accountId) {
      push('failed', 'Chưa có tài khoản Google.', 'full');
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

    push('packing', 'Đang đóng gói corpus…', 'full');
    const preprocess = new FullNovelPreprocessService(this.db);
    const packed = preprocess.packCorpus(projectId);
    const partPaths = packed.parts.map((p) => p.filePath);
    const partNames = packed.parts.map((p) => p.fileName);

    const project = this.db.projects.getById(projectId)!;
    const prompt = buildFullNovelPreprocessPrompt({
      projectTitle: project.title,
      author: project.author_name,
      genre: project.genre,
      partFileNames: partNames,
    });

    push('ensuring_notebook', 'Đang đảm bảo NotebookLM…', 'full');
    const ensure = await this.ensureNotebook(projectId, accountId);
    if (ensure.needsAssisted) {
      push('failed', ensure.message, 'full');
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

    push('uploading', `Đang upload ${partPaths.length} phần lên NotebookLM…`, 'full');
    let rawText: string;
    try {
      rawText = await this.uploadAndAnalyze({
        projectId,
        accountId,
        partPaths,
        prompt,
        headless: options.headless,
        onAnalyzing: () => push('analyzing', 'NotebookLM đang phân tích full truyện…', 'full'),
      });
    } catch (err) {
      const assisted = this.isAssistedError(err);
      const message = err instanceof Error ? err.message : String(err);
      if (assisted) {
        await this.openAssistedBrowser(accountId);
        push('failed', message, 'full');
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
      throw err;
    }

    push('importing', 'Đang import kết quả 00–07…', 'full');
    let imported: ReturnType<FullNovelPreprocessService['importResult']>;
    try {
      imported = preprocess.importResult(projectId, { text: rawText });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      push('failed', `Parse thất bại — dùng Advanced import. ${message}`, 'full');
      clearAutoPreprocessProgress(projectId);
      return {
        mode: 'full',
        status: 'failed',
        message: `Phản hồi NotebookLM không đủ 00–07. Mở Advanced để import thủ công. ${message}`,
        foundKeys: [],
        needsAssisted: false,
        steps,
        accountId,
      };
    }

    push('syncing', 'Đồng bộ Drive…', 'full');
    try {
      await getNotebookSyncService(this.db).syncDrive(projectId);
    } catch (err) {
      logger.warn('Full preprocess: Drive sync deferred', {
        err: err instanceof Error ? err.message : String(err),
        projectId,
      });
    }

    push('done', imported.message, 'full');
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

  private async ensureNotebook(
    projectId: string,
    accountId: string,
  ): Promise<{ needsAssisted: boolean; message: string }> {
    const mapping = this.db.notebooks.getByProjectAndWorker(projectId, accountId);
    const hasUrl = Boolean(mapping?.resource_url?.startsWith('http'));
    const ready =
      mapping &&
      (mapping.status === 'ready' ||
        mapping.status === 'sync_pending' ||
        mapping.status === 'stale');
    // Prefer existing URL — avoid re-provision when mapping already points at a notebook.
    if (ready && hasUrl) {
      return { needsAssisted: false, message: 'Notebook ready' };
    }

    const { getNotebookService } = await import('../services/notebook-service-singleton');
    const result = await getNotebookService().provision({
      projectId,
      accountId,
      headless: false,
    });
    if (result.assisted) {
      return {
        needsAssisted: true,
        message: result.message || 'Cần hoàn tất thiết lập NotebookLM trên trình duyệt.',
      };
    }
    // Re-check URL after provision
    const after = this.db.notebooks.getByProjectAndWorker(projectId, accountId);
    if (!after?.resource_url?.startsWith('http')) {
      return {
        needsAssisted: true,
        message:
          'Notebook chưa có URL. Mở Advanced → Thiết lập Notebook, rồi thử lại.',
      };
    }
    return { needsAssisted: false, message: result.message };
  }

  private async uploadAndAnalyze(input: {
    projectId: string;
    accountId: string;
    partPaths: string[];
    prompt: string;
    headless?: boolean;
    onAnalyzing: () => void;
  }): Promise<string> {
    const mapping = this.db.notebooks.getByProjectAndWorker(
      input.projectId,
      input.accountId,
    );
    if (!mapping?.resource_url) {
      throw new Error('Notebook mapping missing resource_url');
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
    if (profileLockManager.isLocked(profilePath)) {
      profileLockManager.forceClearStaleLock(profilePath);
    }

    const ownerId = `preprocess:${input.projectId}`;
    profileLockManager.acquire(profilePath, ownerId);

    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'preprocess',
    );
    const eventLogDir = path.join(diagnosticsDir, 'events');
    const eventLogger = new BrowserEventLogger(this.db.automationEvents, eventLogDir);
    const workerState = this.db.workerStates.getByAccountId(input.accountId);

    const { chromium } = await import('playwright');
    let context: import('playwright').BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(profilePath, {
        headless: input.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = context.pages()[0] ?? (await context.newPage());

      const notebook = new NotebookProvider({ diagnosticsDir });
      notebook.attachPage(page);

      // Prefer direct notebook URL — list search by name often fails (rename / UI lag).
      const targetUrl = mapping.resource_url;
      if (targetUrl.startsWith('http')) {
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
      } else {
        await notebook.ensureNotebook(mapping.notebook_name ?? input.projectId);
        await notebook.openNotebook(mapping.notebook_name ?? input.projectId);
      }

      await notebook.addFileSources(input.partPaths);
      // Extra settle gate (AI CHAT BATCH): do not chat while sources still indexing.
      const settleOk = await notebook.waitForSourceProcessing(
        0,
        undefined,
        120_000,
      );
      if (!settleOk) {
        logger.warn('Preprocess: source settle soft-timeout; verifying then continuing', {
          projectId: input.projectId,
        });
      }
      await page.waitForTimeout(2_000);

      const gemini = new GeminiBrowserProvider({
        diagnosticsDir,
        eventLogger,
        workerId: workerState?.id ?? null,
        maxTimeoutMs: PREPROCESS_GENERATION_MAX_TIMEOUT_MS,
      });
      gemini.attachPage(page);
      // Stay on current notebook page — avoid re-navigation that races source UI.
      await gemini.createOrOpenTranslationThread({ forceNew: true });
      input.onAnalyzing();
      const correlationId = newId();
      await gemini.submitPlainPrompt(input.prompt, correlationId);
      await gemini.waitForGenerationStart();
      await gemini.waitForGenerationComplete(correlationId, {
        maxTimeoutMs: PREPROCESS_GENERATION_MAX_TIMEOUT_MS,
      });
      const raw = await gemini.extractLatestResponse(correlationId);
      return raw.text;
    } finally {
      await context?.close().catch(() => undefined);
      profileLockManager.release(profilePath, ownerId);
    }
  }

  private resolveAccountId(
    projectId: string,
    preferred?: string | null,
  ): string | null {
    if (preferred) return preferred;
    const mappings = this.db.notebooks.listByProject(projectId);
    const mapped = mappings.find(
      (m) =>
        m.status === 'ready' ||
        m.status === 'sync_pending' ||
        m.status === 'stale' ||
        m.status === 'assisted_setup',
    );
    if (mapped) return mapped.google_account_id;

    const accounts = this.db.googleAccounts.listDetails();
    for (const a of accounts) {
      const health = this.db.workerStates.getByAccountId(a.id)?.health;
      const h = (health ?? '').toUpperCase();
      if (h === 'READY' || h === 'BUSY' || !health) {
        if (a.assigned_project_ids?.includes(projectId)) return a.id;
      }
    }
    for (const a of accounts) {
      const health = this.db.workerStates.getByAccountId(a.id)?.health;
      const h = (health ?? '').toUpperCase();
      if (h === 'READY' || h === 'BUSY') return a.id;
    }
    return accounts[0]?.id ?? null;
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
