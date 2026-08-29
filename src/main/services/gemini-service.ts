import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import type { GeminiRequestRow } from '../db/repositories/gemini-request-repository';
import { GeminiBrowserProvider } from '../automation/providers/google/gemini-browser-provider';
import { BrowserEventLogger } from '../automation/browser-event-logger';
import { AutomationError } from '../automation/errors/automation-errors';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { GeminiSendResponse } from '@shared/schemas/gemini';
import {
  DEFAULT_GENERATION_MAX_TIMEOUT_MS,
  DEFAULT_STABILIZATION_WINDOW_MS,
  formatCorrelationMarker,
  isGeminiLifecycleAtLeast,
  type GeminiRequestLifecycle,
} from '@shared/constants/gemini';
import {
  shouldEnableFailTrace,
  startFailTrace,
} from '../automation/playwright-tracing';
import type { PackMode } from '@shared/constants/pack-mode';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { getBrowserRuntimeManager } from '../automation/browser-runner/browser-runtime-manager';
import { planGeminiRequestRecovery } from '../gemini/gemini-request-recovery';
import { pathsService } from './paths-service';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import { ActiveGenerationRegistry } from './active-generation-registry';

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
  /** Concurrent generations — one entry per correlationId (multi-worker safe). */
  private readonly active = new ActiveGenerationRegistry();

  constructor(private readonly db: DatabaseManager) {}

  /** Test / diagnostics: active generation count. */
  getActiveGenerationCount(): number {
    return this.active.size();
  }

  /**
   * Cancel one in-flight generation by correlationId.
   * Does not touch other workers' requests.
   */
  async cancelActive(correlationId: string): Promise<boolean> {
    if (!correlationId) return false;
    return this.active.cancel(correlationId);
  }

  /** Cancel every active generation (shutdown / adapter close). */
  async cancelAll(): Promise<void> {
    await this.active.cancelAll();
  }

  async close(): Promise<void> {
    await this.active.cancelAll();
    this.active.clear();
  }

  async sendTranslation(input: {
    projectId: string;
    accountId: string;
    pack: TranslationPackDto;
    headless?: boolean;
    maxTimeoutMs?: number;
    stabilizationWindowMs?: number;
    jobId?: string | null;
    /** Optional pre-assigned correlation (adapter requestId) for mid-flight cancel. */
    correlationId?: string | null;
    /** Phase 5+: local_context → Gemini web chat; notebook_assisted → NotebookLM. */
    packMode?: PackMode;
  }): Promise<GeminiSendResponse> {
    const project = this.db.projects.getById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const account = this.db.googleAccounts.getById(input.accountId);
    if (!account) throw new Error(`Account not found: ${input.accountId}`);

    const packMode = input.packMode ?? 'local_context';
    const { getNotebookSendReadinessService } = await import(
      './notebook-send-readiness-singleton'
    );
    const readiness = await getNotebookSendReadinessService().ensureForSend({
      projectId: input.projectId,
      accountId: input.accountId,
      packMode,
    });

    if (!readiness.ok) {
      return {
        correlationId: input.correlationId ?? newId(),
        status: 'failed',
        rawResponse: '',
        rawResponsePath: null,
        retainedRaw: false,
        errorCode: 'NEEDS_ASSISTED',
        errorMessage: readiness.message,
      };
    }

    const notebookUrl = readiness.notebookUrl;
    const notebookRowId = readiness.notebookRowId;
    const mapping = readiness.mapping;

    if (readiness.usedWebChatFallback) {
      this.db.knowledgeSyncEvents.insert({
        projectId: input.projectId,
        eventType: 'TRANSLATION_NOTEBOOK_OPENED',
        message: 'Playwright fallback Gemini web chat (legacy notebook ignored).',
        metadata: { packMode, notebookRowId },
      });
    }

    let requestRow: GeminiRequestRow | null = null;
    if (input.jobId) {
      requestRow = this.db.geminiRequests.findOpenByJobAndPack(
        input.jobId,
        input.pack.promptHash,
      );
    }

    const resuming = Boolean(requestRow);
    const correlationId =
      requestRow?.correlation_id ?? input.correlationId ?? newId();
    requestRow ??= this.db.geminiRequests.create({
        correlation_id: correlationId,
        project_id: input.projectId,
        google_account_id: input.accountId,
        pack_hash: input.pack.promptHash,
        job_id: input.jobId ?? null,
        notebook_id: notebookRowId,
        marker: formatCorrelationMarker(correlationId),
        lifecycle: 'CREATED',
        context_fingerprint_json: input.pack.contextFingerprint
          ? JSON.stringify(input.pack.contextFingerprint)
          : null,
      });

    const profile = this.db.googleAccounts.getProfile(input.accountId);
    if (!profile) throw new Error('Browser profile missing for worker');
    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);

    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      input.accountId,
      'gemini',
    );
    const rawDir = path.join(diagnosticsDir, 'raw-responses');
    const eventLogDir = path.join(diagnosticsDir, 'events');
    const eventLogger = new BrowserEventLogger(this.db.automationEvents, eventLogDir);

    const workerState = this.db.workerStates.getByAccountId(account.id);
    const requestId = requestRow.id;
    const persistLifecycle = (lifecycle: GeminiRequestLifecycle) => {
      this.db.geminiRequests.setLifecycle(requestId, lifecycle);
    };

    const provider = new GeminiBrowserProvider({
      diagnosticsDir,
      eventLogger,
      workerId: workerState?.id ?? null,
      jobId: input.jobId ?? null,
      maxTimeoutMs: input.maxTimeoutMs ?? DEFAULT_GENERATION_MAX_TIMEOUT_MS,
      stabilizationWindowMs:
        input.stabilizationWindowMs ?? DEFAULT_STABILIZATION_WINDOW_MS,
      onLifecycle: (lifecycle) => { persistLifecycle(lifecycle); },
      expectedNotebookUrl: notebookUrl,
    });
    provider.beginTimeline(correlationId);

    const retainRaw = loadRetainRawResponses(this.db, input.projectId);
    const runtimeManager = getBrowserRuntimeManager();
    const nestUnderExternalLock =
      profileLockManager.isHeldByJob(profilePath, input.jobId) ||
      profileLockManager.isHeldByRuntime(profilePath, input.accountId);

    try {
      return await runtimeManager.runExclusive(
        {
          accountId: input.accountId,
          profilePath,
          diagnosticsDir,
          headless: input.headless,
          jobId: input.jobId,
          nestUnderExternalLock,
        },
        async ({ runtime, prepareNotebook }) => {
          runtime.setGenerationState('SENDING');
          const page = await prepareNotebook({
            projectId: input.projectId,
            notebookUrl,
            openNotebook: async (p, url) => {
              provider.attachPage(p);
              await provider.openProjectNotebook(url || notebookUrl);
            },
            verifyReady: async (p) => {
              provider.attachPage(p);
              const ok = await provider.healthCheck();
              if (!ok.ok) {
                provider.attachPage(p);
                await provider.openProjectNotebook(notebookUrl);
              }
            },
          });

          provider.attachPage(page);
          this.db.geminiRequests.setThreadRef(requestId, page.url());
          this.active.register({
            correlationId,
            accountId: input.accountId,
            startedAt: Date.now(),
            cancel: async () => {
              await provider.cancelGeneration();
            },
          });

          const { loadNotebookSettings } = await import('../notebook/knowledge-builder');
          const settings = loadNotebookSettings(this.db, input.projectId);
          const batches = mapping
            ? this.db.notebooks.incrementBatchCounter(mapping.id)
            : 0;
          const forceNewThread = !resuming && batches >= settings.threadRotateEvery;
          if (forceNewThread && mapping) {
            this.db.notebooks.resetBatchCounter(mapping.id);
          }
          await provider.createOrOpenTranslationThread({ forceNew: forceNewThread });
          this.db.geminiRequests.setThreadRef(requestId, page.url());

          const marker =
            requestRow.marker ?? formatCorrelationMarker(correlationId);
          const existingRawPath = requestRow.raw_response_path;
          const existingRaw =
            existingRawPath && fs.existsSync(existingRawPath)
              ? fs.readFileSync(existingRawPath, 'utf8')
              : null;

          const shouldRecover =
            resuming ||
            isGeminiLifecycleAtLeast(
              requestRow.lifecycle,
              'SEND_CLICKED',
            );

          if (shouldRecover) {
            const pageProbe = await provider.probeForRecovery(marker);
            const plan = planGeminiRequestRecovery(
              requestRow.lifecycle,
              {
                ...pageProbe,
                rawCaptured: Boolean(existingRaw),
                parsed: requestRow.lifecycle === 'PARSED',
              },
            );

            logger.info('Gemini request recovery plan', {
              correlationId,
              lifecycle: requestRow.lifecycle,
              action: plan.action,
              reason: plan.reason,
            });

            if (plan.action === 'fail') {
              throw new AutomationError('UNKNOWN_UI', plan.reason);
            }

            if (plan.action === 'noop_complete' || plan.action === 'parse_existing') {
              const text =
                existingRaw ??
                (await provider.extractLatestResponse(correlationId)).text;
              if (!existingRaw) {
                const rawPath = provider.writeRawResponseFile(correlationId, text, rawDir);
                this.db.geminiRequests.setLifecycle(requestId, 'RESPONSE_CAPTURED', {
                  rawResponsePath: rawPath,
                });
              }
              this.db.geminiRequests.setLifecycle(requestId, 'COMPLETED');
              await provider.detach();
              return this.successResponse(
                correlationId,
                text,
                retainRaw,
                retainRaw ? existingRawPath : null,
              );
            }

            if (plan.action !== 'resend') {
              // wait / capture / search_thread — never duplicate send.
              runtime.setGenerationState('GENERATING');
              const anchored = await provider.resumeAnchorFromMarker(correlationId, marker);
              if (!anchored && plan.action === 'search_thread') {
                throw new AutomationError(
                  'RESPONSE_NOT_FOUND',
                  'SENT_CONFIRMED request: correlation marker not found in notebook thread — refusing resend',
                );
              }
              if (
                !isGeminiLifecycleAtLeast(
                  requestRow.lifecycle,
                  'SENT_CONFIRMED',
                )
              ) {
                this.db.geminiRequests.setLifecycle(requestId, 'SENT_CONFIRMED');
              }
              if (plan.action === 'wait_generation' || !pageProbe.responseComplete) {
                await provider.waitForGenerationComplete(correlationId);
              }
              runtime.setGenerationState('STABILIZING');
              const raw = await provider.extractLatestResponse(correlationId);
              runtime.setGenerationState('IDLE');
              const rawPath = provider.writeRawResponseFile(correlationId, raw.text, rawDir);
              this.db.geminiRequests.setLifecycle(requestId, 'RESPONSE_CAPTURED', {
                rawResponsePath: rawPath,
              });
              this.db.geminiRequests.setLifecycle(requestId, 'COMPLETED');
              if (!retainRaw) this.scheduleRawCleanup(rawPath);
              const { markProviderRunSuccess } = await import('./diagnostics-service');
              markProviderRunSuccess(this.db, 'google-gemini');
              await provider.detach();
              return this.successResponse(
                correlationId,
                raw.text,
                retainRaw,
                retainRaw ? rawPath : null,
              );
            }
            // plan.action === 'resend' → fall through to submit once
          }

          const enableTrace = shouldEnableFailTrace({
            isRetry: shouldRecover || resuming,
          });
          if (enableTrace) {
            const ctx = runtime.getContext();
            if (ctx) {
              const session = await startFailTrace(
                ctx,
                diagnosticsDir,
                correlationId.slice(0, 12),
              );
              provider.setFailTraceSession(session);
            }
          }

          runtime.setGenerationState('GENERATING');
          await provider.submitTranslationPack(input.pack, correlationId);
          await provider.waitForGenerationStart();
          runtime.setGenerationState('STABILIZING');
          await provider.waitForGenerationComplete(correlationId);
          const raw = await provider.extractLatestResponse(correlationId);
          runtime.setGenerationState('IDLE');
          await provider.discardFailTrace();

          const rawPath = provider.writeRawResponseFile(correlationId, raw.text, rawDir);
          this.db.geminiRequests.setLifecycle(requestId, 'RESPONSE_CAPTURED', {
            rawResponsePath: rawPath,
          });
          this.db.geminiRequests.setLifecycle(requestId, 'COMPLETED');

          if (!retainRaw) {
            this.scheduleRawCleanup(rawPath);
          }

          const { markProviderRunSuccess } = await import('./diagnostics-service');
          markProviderRunSuccess(this.db, 'google-gemini');

          await provider.detach();

          return this.successResponse(
            correlationId,
            raw.text,
            retainRaw,
            retainRaw ? rawPath : null,
          );
        },
      );
    } catch (error) {
      const automationError =
        error instanceof AutomationError
          ? error
          : new AutomationError(
              'UNKNOWN_UI',
              error instanceof Error ? error.message : String(error),
            );

      if (
        automationError.code === 'SESSION_EXPIRED' ||
        automationError.code === 'LOGIN_REQUIRED'
      ) {
        if (workerState) {
          this.db.workerStates.setHealth(workerState.id, 'NEEDS_ATTENTION', {
            lastError: automationError.message,
          });
        }
      }

      let rawPath: string | null = null;
      if (automationError.diagnostics?.htmlSnapshotPath) {
        rawPath = automationError.diagnostics.htmlSnapshotPath;
      }

      const lifecycle = (this.db.geminiRequests.getById(requestId)?.lifecycle ??
        'CREATED');
      if (isGeminiLifecycleAtLeast(lifecycle, 'SENT_CONFIRMED')) {
        this.db.geminiRequests.markUnknownAfterCrash(requestId);
      } else {
        this.db.geminiRequests.markFailed(
          requestId,
          automationError.code,
          automationError.message,
          rawPath,
        );
      }

      logger.warn('Gemini send failed', {
        correlationId,
        code: automationError.code,
        message: automationError.message,
        lifecycle,
        failedStep: automationError.diagnostics?.failedStep ?? null,
        lastOkStep: automationError.diagnostics?.lastOkStep ?? null,
        surface: automationError.diagnostics?.surface ?? null,
      });

      await provider.discardFailTrace().catch(() => undefined);
      await provider.detach().catch(() => undefined);

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
      // Only this request — never wipe sibling workers' cancel handles.
      this.active.unregister(correlationId);
    }
  }

  private successResponse(
    correlationId: string,
    text: string,
    retainRaw: boolean,
    rawPath: string | null,
  ): GeminiSendResponse {
    return {
      correlationId,
      status: 'completed',
      rawResponse: text,
      rawResponsePath: retainRaw ? rawPath : null,
      retainedRaw: retainRaw,
      errorCode: null,
      errorMessage: null,
    };
  }

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
