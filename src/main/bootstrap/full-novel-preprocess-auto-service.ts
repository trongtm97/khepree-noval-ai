import type { DatabaseManager } from '../db/database-manager';
import { decidePreprocessMode } from '@shared/constants/notebooklm-preprocess-auto';
import { logger } from '../logging/logger';
import { BootstrapAnalysisService } from './bootstrap-analysis-service';
import {
  clearAutoPreprocessProgress,
  setAutoPreprocessProgress,
  type AutoPreprocessResult,
} from './auto-preprocess-progress';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import { FullNovelPreprocessOrchestrator } from './full-novel-preprocess-orchestrator';
import { resolveProjectWorker } from '../services/project-worker-resolver';

export type { AutoPreprocessResult };

export interface AutoPreprocessRunOptions {
  forceFull?: boolean;
  googleAccountId?: string | null;
  headless?: boolean;
  forceNewRun?: boolean;
  sourceIndexTimeoutMs?: number;
}

/**
 * One-click AI memory init: Quick bootstrap OR full NotebookLM auto pipeline.
 * FULL path is resumable via FullNovelPreprocessOrchestrator (SQLite stages).
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
    const push = (
      step: Parameters<typeof setAutoPreprocessProgress>[1],
      message: string,
      mode?: 'quick' | 'full',
    ) => {
      steps.push(`${step}: ${message}`);
      setAutoPreprocessProgress(projectId, step, message, mode ?? null);
    };

    try {
      push('deciding', 'Đang chọn chế độ khởi tạo…');
      const chapters = this.db.chapters
        .listByProject(projectId)
        .filter(
          (c) =>
            c.source_status === 'SOURCE_READY' && (c.source_text?.trim() ?? '').length > 0,
        );
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
      return await this.runFull(projectId, options, steps);
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
    push: (
      step: Parameters<typeof setAutoPreprocessProgress>[1],
      message: string,
      mode?: 'quick' | 'full',
    ) => void,
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
      await getNotebookSyncService(this.db).syncLocalKnowledge(projectId);
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
  ): Promise<AutoPreprocessResult> {
    const result = await new FullNovelPreprocessOrchestrator(this.db).run(projectId, {
      googleAccountId: options.googleAccountId,
      headless: options.headless,
      forceNewRun: options.forceNewRun,
      sourceIndexTimeoutMs: options.sourceIndexTimeoutMs,
    });
    steps.push(...result.steps);
    return result;
  }

  private resolveAccountId(
    projectId: string,
    preferred?: string | null,
  ): string | null {
    if (preferred && this.db.googleAccounts.getById(preferred)) return preferred;
    return resolveProjectWorker(this.db, {
      projectId,
      purpose: 'preprocess',
    }).accountId;
  }
}
