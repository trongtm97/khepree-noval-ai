import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import { AutomationError } from '../automation/errors/automation-errors';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { GeminiSendResponse } from '@shared/schemas/gemini';
import {
  DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  DEFAULT_STABILIZATION_WINDOW_MS,
} from '@shared/constants/gemini';
import { newId } from '../db/utils/uuid';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { pathsService } from './paths-service';
import { logger } from '../logging/logger';

function loadRetainRawResponses(db: DatabaseManager, projectId: string): boolean {
  const row = db
    .getConnection()
    .prepare(`SELECT style_config FROM project_settings WHERE project_id = ?`)
    .get(projectId) as { style_config: string | null } | undefined;

  if (!row?.style_config) return false;
  try {
    const parsed = JSON.parse(row.style_config) as { retainRawResponses?: boolean };
    return parsed.retainRawResponses === true;
  } catch {
    return false;
  }
}

export class GeminiService {
  constructor(private readonly db: DatabaseManager) {}

  async sendTranslation(input: {
    projectId: string;
    accountId: string;
    pack: TranslationPackDto;
    headless?: boolean;
    maxTimeoutMs?: number;
    stabilizationWindowMs?: number;
    jobId?: string | null;
  }): Promise<GeminiSendResponse> {
    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const account = this.db.googleAccounts.getById(input.accountId);
    if (!account) throw new Error(`Account not found: ${input.accountId}`);

    const mapping = this.db.notebooks.getByProjectAndWorker(
      input.projectId,
      input.accountId,
    );
    if (
      !mapping ||
      (mapping.status !== 'ready' && mapping.status !== 'sync_pending')
    ) {
      throw new Error(
        'Notebook mapping not ready — provision NotebookLM first for this worker.',
      );
    }

    const correlationId = newId();
    const requestRow = this.db.geminiRequests.create({
      correlation_id: correlationId,
      project_id: input.projectId,
      google_account_id: input.accountId,
      pack_hash: input.pack.promptHash,
      job_id: input.jobId ?? null,
      status: 'pending',
    });

    const profile = this.db.googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for worker');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);

    const ownerId = `gemini-send:${correlationId}`;
    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'gemini',
    );
    const rawDir = path.join(diagnosticsDir, 'raw-responses');
    const eventLogDir = path.join(diagnosticsDir, 'events');
    const eventLogger = new BrowserEventLogger(this.db.automationEvents, eventLogDir);

    // automation_events.worker_id FK → worker_states.id (not google_accounts.id).
    const workerState = this.db.workerStates.getByAccountId(account.id);
    const provider = new GeminiBrowserProvider({
      diagnosticsDir,
      eventLogger,
      workerId: workerState?.id ?? null,
      jobId: input.jobId ?? null,
      maxTimeoutMs: input.maxTimeoutMs ?? DEFAULT_GENERATION_MAX_TIMEOUT_MS,
      stabilizationWindowMs:
        input.stabilizationWindowMs ?? DEFAULT_STABILIZATION_WINDOW_MS,
    });

    const retainRaw = loadRetainRawResponses(this.db, input.projectId);
    const nestUnderJobLock = profileLockManager.isHeldByJob(profilePath, input.jobId);

    try {
      if (!nestUnderJobLock) {
        profileLockManager.acquire(profilePath, ownerId);
      }
      this.db.geminiRequests.markRunning(requestRow.id);

      const { chromium } = await import('playwright');
      const context = await chromium.launchPersistentContext(profilePath, {
        // Headed default: NotebookLM often blank under headless (same as notebook provision / AI CHAT BATCH).
        headless: input.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = context.pages()[0] ?? (await context.newPage());

      try {
        provider.attachPage(page);
        await provider.openProjectNotebook(mapping.resource_url);

        const { loadNotebookSettings } = await import('../notebook/knowledge-builder');
        const settings = loadNotebookSettings(this.db, input.projectId);
        const batches = this.db.notebooks.incrementBatchCounter(mapping.id);
        const forceNewThread = batches >= settings.threadRotateEvery;
        if (forceNewThread) {
          this.db.notebooks.resetBatchCounter(mapping.id);
        }
        await provider.createOrOpenTranslationThread({ forceNew: forceNewThread });
        await provider.submitTranslationPack(input.pack, correlationId);
        await provider.waitForGenerationStart();
        await provider.waitForGenerationComplete(correlationId);
        const raw = await provider.extractLatestResponse(correlationId);

        const rawPath = provider.writeRawResponseFile(correlationId, raw.text, rawDir);
        this.db.geminiRequests.markCompleted(requestRow.id, rawPath);

        if (!retainRaw) {
          this.scheduleRawCleanup(rawPath);
        }

        const { markProviderRunSuccess } = await import('./diagnostics-service');
        markProviderRunSuccess(this.db, 'google-gemini');

        return {
          correlationId,
          status: 'completed',
          rawResponse: raw.text,
          rawResponsePath: retainRaw ? rawPath : null,
          retainedRaw: retainRaw,
          errorCode: null,
          errorMessage: null,
        };
      } finally {
        await provider.detach();
        await context.close().catch(() => undefined);
      }
    } catch (error) {
      const automationError =
        error instanceof AutomationError
          ? error
          : new AutomationError(
              'UNKNOWN_UI',
              error instanceof Error ? error.message : String(error),
            );

      let rawPath: string | null = null;
      if (automationError.diagnostics?.htmlSnapshotPath) {
        rawPath = automationError.diagnostics.htmlSnapshotPath;
      }

      this.db.geminiRequests.markFailed(
        requestRow.id,
        automationError.code,
        automationError.message,
        rawPath,
      );

      logger.warn('Gemini send failed', {
        correlationId,
        code: automationError.code,
        message: automationError.message,
      });

      return {
        correlationId,
        status: 'failed',
        rawResponse: '',
        rawResponsePath: rawPath,
        retainedRaw: false,
        errorCode: automationError.code,
        errorMessage: automationError.message,
      };
    } finally {
      if (!nestUnderJobLock) {
        profileLockManager.release(profilePath, ownerId);
      }
    }
  }

  /** Delete temporary raw file after handoff when user opts out of long-term retention. */
  private scheduleRawCleanup(rawPath: string): void {
    setTimeout(() => {
      try {
        if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
      } catch {
        // best-effort cleanup
      }
    }, 5_000);
  }
}
