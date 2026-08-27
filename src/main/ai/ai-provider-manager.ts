import type { DatabaseManager } from '../db/database-manager';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import {
  AI_FALLBACK_META_KEYS,
  AI_PROVIDER_IDS,
  AUTH_FALLBACK_STATUSES,
  DEFAULT_FALLBACK_STATUSES,
  type AiProviderType,
  type AiResponseStatus,
} from '@shared/constants/ai-provider';
import {
  AI_ROUTING_META_KEYS,
  type AiRoutingMode,
} from '@shared/constants/provider-preflight';
import type { IAIProvider } from './iai-provider';
import type { AIResponse, SendPromptOptions } from './types';
import { isGeminiSoftErrorText, geminiSoftErrorSnippet } from '@shared/utils/gemini-soft-error';
import { userMessageForStatus } from './error-map';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import type { JobExecuteContext, InitialSendResult } from '../jobs/batch-executor';
import type { RepairSendRequest, RepairSendResult } from '../jobs/repair-loop';
import { getTranslationPackService } from '../services/translation-pack-service-singleton';
import { resolveTranslationPackMode } from '../prompt/pack-mode-resolver';
import { resolveTranslationNotebook } from '../notebook/notebook-resolver';
import type { PackMode } from '@shared/constants/pack-mode';
import { parseJobConfig } from '../jobs/batch-executor';
import type { TranslationPackBuildResult } from '../services/translation-pack-service';
import { ResponseParser } from '../jobs/response-parser';
import {
  buildMergedTranslationProtocol,
  chunkParagraphBatch,
  chunkParagraphBatchForPlaywright,
  mergeTermDeltas,
  mergeMemoryDeltas,
  resolveTranslateBatchParagraphs,
  splitParagraphChunkInHalf,
} from '../jobs/translate-chunking';
import type { TranslationLine } from '@shared/schemas/output-protocol';
import type { TermDeltaItem } from '@shared/schemas/term-delta';
import type { MemoryDeltaItem } from '@shared/schemas/memory-delta';
import {
  DEFAULT_MAX_CONTINUATION_ATTEMPTS,
  DEFAULT_MAX_CHAPTERS_PER_JOB,
} from '@shared/constants/job';
import {
  runContinuationLoop,
  assessBatchCompleteness,
} from '../jobs/continuation';
import type { RepairParagraph } from '../jobs/repair-strategies';
import {
  channelSnapshotForAttempt,
  readRepairChannelFromProgress,
  type RepairChannelContext,
} from '../jobs/repair-channel-context';
import {
  extractOperationPrompt,
  isRepairOrContinuationOp,
  splitRepairChannelPrompt,
  assemblePackPrompt,
} from '../prompt/pack-operation';
import type { TranslationPackOperation } from '@shared/constants/translation-pack';
import { getNotebookSyncService } from '../notebook/notebook-sync-service-singleton';
import {
  buildTranslationContextDiagnostics,
  logJobKnowledgeEvent,
  mergeJobProgressDiagnostics,
} from '../jobs/translation-context-diagnostics';
import type { TranslationContextDiagnostics } from '@shared/constants/translation-context';
import {
  checkProviderForJob,
  filterProvidersByPreflight,
  type ProviderPreflightReport,
} from './provider-preflight';

/** Retries when a chunk fails transiently or returns zero translation lines. */
const CHUNK_SEND_RETRIES = 2;

/** Pause between successful Web API chunks — reduces Gemini soft-error streaks. */
const WEB_API_INTER_CHUNK_DELAY_MS = 2_500;

const TRANSIENT_CHUNK_STATUSES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMIT',
]);

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isFallbackStatus(
  status: AiResponseStatus,
  allowed: ReadonlySet<AiResponseStatus>,
): boolean {
  return allowed.has(status);
}

function protocolFailSnippet(text: string, max = 160): string {
  const oneLine = text.trim().replace(/\s+/g, ' ');
  if (!oneLine) return '(phản hồi rỗng)';
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

export class AiProviderManager {
  private readonly providers = new Map<string, IAIProvider>();
  private initialized = false;

  constructor(private readonly db: DatabaseManager) {}

  register(provider: IAIProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  getProvider(providerId: string): IAIProvider | undefined {
    return this.providers.get(providerId);
  }

  listRegistered(): IAIProvider[] {
    return [...this.providers.values()];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    for (const provider of this.providers.values()) {
      try {
        await provider.initialize();
      } catch (error) {
        logger.warn('AI provider initialize failed', {
          providerId: provider.providerId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.initialized = true;
  }

  async close(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.close().catch(() => undefined);
    }
    this.initialized = false;
  }

  isFallbackEnabled(): boolean {
    return this.db.appMeta.get(AI_FALLBACK_META_KEYS.enabled) !== '0';
  }

  getFallbackStatuses(): AiResponseStatus[] {
    const raw = this.db.appMeta.get(AI_FALLBACK_META_KEYS.onStatuses);
    let parsed: AiResponseStatus[] = [...DEFAULT_FALLBACK_STATUSES];
    if (raw) {
      try {
        const value = JSON.parse(raw) as AiResponseStatus[];
        if (Array.isArray(value)) parsed = value;
      } catch {
        parsed = [...DEFAULT_FALLBACK_STATUSES];
      }
    }
    // Narrow app_meta overrides must not drop auth / hard-fail fallbacks —
    // otherwise SESSION_EXPIRED or Playwright ERROR never reaches Web API.
    const merged: AiResponseStatus[] = [
      ...parsed,
      ...AUTH_FALLBACK_STATUSES,
      'ERROR',
      'SERVICE_UNAVAILABLE',
      'NETWORK_ERROR',
      'TIMEOUT',
    ];
    return [...new Set(merged)];
  }

  setFallbackConfig(enabled: boolean, statuses?: AiResponseStatus[]): void {
    this.db.appMeta.set(AI_FALLBACK_META_KEYS.enabled, enabled ? '1' : '0');
    if (statuses) {
      this.db.appMeta.set(AI_FALLBACK_META_KEYS.onStatuses, JSON.stringify(statuses));
    }
  }

  getRoutingMode(): AiRoutingMode {
    const raw = this.db.appMeta.get(AI_ROUTING_META_KEYS.mode);
    return raw === 'PIN' ? 'PIN' : 'AUTO';
  }

  setRoutingMode(mode: AiRoutingMode, pinnedProviderId?: string | null): void {
    this.db.appMeta.set(AI_ROUTING_META_KEYS.mode, mode);
    if (pinnedProviderId !== undefined) {
      this.db.appMeta.set(
        AI_ROUTING_META_KEYS.pinnedProviderId,
        pinnedProviderId ?? '',
      );
    }
  }

  getPinnedProviderId(): string | null {
    const fromMeta = this.db.appMeta.get(AI_ROUTING_META_KEYS.pinnedProviderId);
    if (fromMeta && fromMeta.length > 0) return fromMeta;
    return this.db.aiProviders.listEnabledOrdered()[0]?.id ?? null;
  }

  /**
   * Ordered enabled providers — **DB priority first** (lower number = tried first).
   * Soft demote when notebook missing (legacy sync path). Prefer
   * {@link selectProvidersForJob} which runs account-aware preflight.
   */
  selectOrderedProviders(options?: {
    projectId?: string;
    googleAccountId?: string;
  }): IAIProvider[] {
    const rows = this.db.aiProviders.listEnabledOrdered();
    const result: IAIProvider[] = [];
    for (const row of rows) {
      const impl = this.providers.get(row.id);
      if (impl) result.push(impl);
    }

    const notebookOk = (() => {
      if (!options?.projectId || !options.googleAccountId) return false;
      const mapping = resolveTranslationNotebook(
        this.db,
        options.projectId,
        options.googleAccountId,
      );
      return Boolean(
        mapping &&
          (mapping.status === 'ready' ||
            mapping.status === 'sync_pending' ||
            mapping.status === 'stale'),
      );
    })();

    if (!notebookOk) {
      result.sort((a, b) => {
        const score = (p: IAIProvider): number =>
          p.providerType === 'PLAYWRIGHT_GEMINI' ? 1 : 0;
        return score(a) - score(b);
      });
    }

    return result;
  }

  /**
   * Account-aware selection: only providers that pass preflight.
   * PIN → preferred provider only (no auto-switch).
   * AUTO → READY (else DEGRADED) by priority.
   */
  async selectProvidersForJob(options: {
    projectId: string;
    googleAccountId: string;
    jobId?: string | null;
    notebookRole?: 'TRANSLATION' | 'RESEARCH' | 'SINGLE';
    pinnedProviderId?: string | null;
    routingMode?: AiRoutingMode;
  }): Promise<{ providers: IAIProvider[]; reports: ProviderPreflightReport[] }> {
    const mode = options.routingMode ?? this.getRoutingMode();
    const pinnedId =
      options.pinnedProviderId ??
      (mode === 'PIN' ? this.getPinnedProviderId() : null);

    let candidates = this.selectOrderedProviders({
      projectId: options.projectId,
      googleAccountId: options.googleAccountId,
    });

    if (mode === 'PIN' && pinnedId) {
      const pinned = candidates.find((p) => p.providerId === pinnedId);
      candidates = pinned ? [pinned] : [];
    }

    const reports: ProviderPreflightReport[] = [];
    for (const provider of candidates) {
      const report = await checkProviderForJob(this.db, {
        accountId: options.googleAccountId,
        projectId: options.projectId,
        notebookRole: options.notebookRole ?? 'TRANSLATION',
        providerId: provider.providerId,
        provider,
        jobId: options.jobId ?? null,
        lightweight: true,
      });
      reports.push(report);
      logger.info('Provider preflight', {
        providerId: provider.providerId,
        result: report.result,
        message: report.message,
      });
    }

    const usableReports = filterProvidersByPreflight(reports, mode);
    const usableIds = new Set(usableReports.map((r) => r.providerId));
    const providers = candidates.filter((p) => usableIds.has(p.providerId));

    return { providers, reports };
  }

  async sendWithFallback(
    pack: TranslationPackDto,
    options?: SendPromptOptions & { pinnedProviderId?: string | null },
  ): Promise<AIResponse> {
    await this.initialize();

    let ordered: IAIProvider[];
    if (options?.projectId && options.googleAccountId) {
      const selected = await this.selectProvidersForJob({
        projectId: options.projectId,
        googleAccountId: options.googleAccountId,
        jobId: options.jobId ?? null,
        pinnedProviderId: options.pinnedProviderId ?? null,
      });
      ordered = selected.providers;
      if (ordered.length === 0) {
        const detail = selected.reports
          .map((r) => `${r.providerId}:${r.result}`)
          .join(', ');
        return {
          requestId: options.requestId ?? newId(),
          status: 'ERROR',
          text: '',
          errorCode: 'NO_READY_PROVIDER',
          errorMessage: `Không có AI provider READY cho tài khoản này (${detail || 'empty'}).`,
        };
      }
    } else {
      ordered = this.selectOrderedProviders({
        projectId: options?.projectId,
        googleAccountId: options?.googleAccountId ?? undefined,
      });
    }

    if (ordered.length === 0) {
      return {
        requestId: options?.requestId ?? newId(),
        status: 'ERROR',
        text: '',
        errorCode: 'NO_PROVIDER',
        errorMessage: 'Không có nhà cung cấp AI nào được bật.',
      };
    }

    const fallbackOn = this.isFallbackEnabled() && this.getRoutingMode() !== 'PIN';
    const fallbackStatuses = new Set(this.getFallbackStatuses());
    let last: AIResponse | null = null;

    for (let i = 0; i < ordered.length; i += 1) {
      const provider = ordered[i];
      const row = this.db.aiProviders.getById(provider.providerId);

      // Legacy skip if somehow selected without accounts (preflight should catch).
      if (provider.providerType === 'GEMINI_WEB_API') {
        const readyAccounts = this.db.aiAccounts.listReadyByProvider(provider.providerId);
        if (readyAccounts.length === 0) {
          logger.info('Bỏ qua Gemini Web API — chưa có tài khoản READY', {
            providerId: provider.providerId,
          });
          last = {
            requestId: options?.requestId ?? newId(),
            status: 'LOGIN_REQUIRED',
            text: '',
            errorCode: 'NO_AI_ACCOUNT',
            errorMessage: userMessageForStatus('LOGIN_REQUIRED'),
          };
          continue;
        }
      }

      const packForProvider = this.adaptPackForProvider(pack, provider, options);

      logger.info('Đang sử dụng AI provider', {
        provider: provider.providerType,
        providerId: provider.providerId,
        event: 'REQUEST_STARTED',
        packModeHint:
          provider.providerType === 'GEMINI_WEB_API' ? 'sqlite-local' : 'notebook',
      });

      const response = await provider.sendPrompt(packForProvider, {
        ...options,
        requestId: options?.requestId ?? newId(),
      });

      if (response.status === 'SUCCESS') {
        if (!response.text.trim()) {
          logger.warn('AI provider returned empty SUCCESS text', {
            provider: provider.providerType,
            requestId: response.requestId,
          });
          last = {
            ...response,
            status: 'SERVICE_UNAVAILABLE',
            text: '',
            errorCode: 'EMPTY_RESPONSE',
            errorMessage: 'Phản hồi AI rỗng — thử lại hoặc đổi provider.',
          };
          const canFallbackEmpty =
            fallbackOn &&
            row?.fallback_allowed === 1 &&
            i < ordered.length - 1 &&
            isFallbackStatus('SERVICE_UNAVAILABLE', fallbackStatuses);
          if (canFallbackEmpty) {
            logger.info('Fallback sang provider kế tiếp (empty response)', {
              from: provider.providerType,
            });
            continue;
          }
          return last;
        }
        if (isGeminiSoftErrorText(response.text)) {
          const snippet = geminiSoftErrorSnippet(response.text);
          logger.warn('AI provider returned soft-error text as SUCCESS', {
            provider: provider.providerType,
            snippet,
          });
          last = {
            ...response,
            status: 'SERVICE_UNAVAILABLE',
            text: '',
            errorCode: 'GEMINI_SOFT_ERROR',
            errorMessage: snippet,
          };
          const canFallbackSoft =
            fallbackOn &&
            row?.fallback_allowed === 1 &&
            i < ordered.length - 1 &&
            isFallbackStatus('SERVICE_UNAVAILABLE', fallbackStatuses);
          if (canFallbackSoft) {
            logger.info('Fallback sang provider kế tiếp (soft error)', {
              from: provider.providerType,
            });
            continue;
          }
          return last;
        }
        logger.info('Đã nhận phản hồi từ AI', {
          provider: provider.providerType,
          event: 'REQUEST_COMPLETED',
          requestId: response.requestId,
        });
        return response;
      }

      logger.warn('AI provider request failed', {
        provider: provider.providerType,
        event: 'REQUEST_FAILED',
        status: response.status,
        errorCode: response.errorCode,
      });
      last = response;

      const canFallback =
        fallbackOn &&
        row?.fallback_allowed === 1 &&
        i < ordered.length - 1 &&
        isFallbackStatus(response.status, fallbackStatuses);

      if (!canFallback) {
        break;
      }

      logger.info('Fallback sang provider kế tiếp', {
        from: provider.providerType,
        status: response.status,
      });
    }

    return (
      last ?? {
        requestId: options?.requestId ?? newId(),
        status: 'UNKNOWN',
        text: '',
        errorCode: 'UNKNOWN',
        errorMessage: userMessageForStatus('UNKNOWN'),
      }
    );
  }

  /**
   * Production JobInitialSender — build TranslationPack then send via manager.
   * Large chapters are sent in silent chunks; one job, one merged response.
   */
  async sendForJob(ctx: JobExecuteContext): Promise<InitialSendResult> {
    const config = parseJobConfig(ctx.job.config);
    const paragraphs = config.batchParagraphs;
    await this.initialize();
    const { providers: ordered } = await this.selectProvidersForJob({
      projectId: ctx.job.project_id,
      googleAccountId: ctx.accountId,
      jobId: ctx.job.id,
      notebookRole: 'TRANSLATION',
      pinnedProviderId:
        (config as { pinnedProviderId?: string }).pinnedProviderId ?? null,
    });
    if (ordered.length === 0) {
      throw new Error(
        'NO_READY_PROVIDER: Không có AI provider READY cho tài khoản/job này (preflight).',
      );
    }
    const batchSize = resolveTranslateBatchParagraphs(ordered[0]?.providerType);
    const playwrightFirst = ordered[0]?.providerType === 'PLAYWRIGHT_GEMINI';
    const chunks = playwrightFirst
      ? chunkParagraphBatchForPlaywright(paragraphs)
      : chunkParagraphBatch(paragraphs, batchSize);
    const totalParas = paragraphs.length;
    const chunkTotal = Math.max(1, chunks.length);

    logger.info('Đã gửi batch chương', {
      jobId: ctx.job.id,
      chapterFrom: ctx.job.chapter_from,
      chapterTo: ctx.job.chapter_to,
      paragraphs: totalParas,
      chunks: chunkTotal,
      batchSize,
      firstProvider: ordered[0]?.providerType ?? null,
    });

    const firstProviderType = ordered.at(0)?.providerType;
    const packMode = this.resolvePackMode(ctx, firstProviderType);

    if (chunks.length <= 1) {
      const pack = this.buildPackForJob(
        ctx,
        config.sourceParagraphIds,
        packMode,
        firstProviderType,
      );
      const telemetry = this.packTelemetryFields(pack);
      this.db.jobs.updateState(ctx.job.id, 'SENDING');
      const diagnostics = this.recordPackDiagnostics(
        ctx,
        pack,
        firstProviderType ?? null,
        {
          phase: 'sending',
          chunkIndex: 1,
          chunkTotal: 1,
          paragraphsDone: 0,
          paragraphsTotal: totalParas,
        },
      );
      this.db.jobs.updateState(ctx.job.id, 'WAITING_AI');
      this.writeSendProgress(ctx, {
        phase: 'waiting_ai',
        chunkIndex: 1,
        chunkTotal: 1,
        paragraphsDone: 0,
        paragraphsTotal: totalParas,
        ...telemetry,
        providerType: firstProviderType,
        diagnostics,
      });
      const response = await this.sendWithFallback(pack, {
        projectId: ctx.job.project_id,
        googleAccountId: ctx.accountId,
        jobId: ctx.job.id,
        pinnedProviderId:
          (config as { pinnedProviderId?: string }).pinnedProviderId ?? null,
      });
      if (response.status !== 'SUCCESS') {
        const msg =
          response.errorMessage ?? userMessageForStatus(response.status);
        throw new Error(`${response.status}: ${msg}`);
      }
      mergeJobProgressDiagnostics(this.db, ctx.job.id, {
        ...diagnostics,
        providerType: response.providerType ?? diagnostics.providerType,
      }, {
        event: 'RESPONSE_CAPTURED',
        message: `corr:${response.requestId}`,
      });
      logJobKnowledgeEvent(this.db, {
        projectId: ctx.job.project_id,
        jobId: ctx.job.id,
        eventType: 'RESPONSE_CAPTURED',
        message: 'AI response captured',
        diagnostics: { ...diagnostics, providerType: response.providerType ?? null },
      });
      const finalized = await this.finalizeChunkWithContinuation(ctx, {
        raw: response.text,
        paragraphIds: config.sourceParagraphIds,
        batchParagraphs: paragraphs,
        packMode,
        chunkIndex: 1,
        chunkTotal: 1,
        paragraphsDone: 0,
        paragraphsTotal: totalParas,
        providerType: response.providerType,
      });
      this.writeSendProgress(ctx, {
        phase: 'waiting_ai',
        chunkIndex: 1,
        chunkTotal: 1,
        paragraphsDone: totalParas,
        paragraphsTotal: totalParas,
        ...telemetry,
        providerType: response.providerType,
        diagnostics: {
          ...diagnostics,
          providerType: response.providerType ?? diagnostics.providerType,
        },
      });
      return {
        rawResponse: finalized.raw,
        inputRef: `corr:${response.requestId}`,
      };
    }

    const parser = new ResponseParser();
    const merged: TranslationLine[] = [];
    const mergedTermDeltas: TermDeltaItem[][] = [];
    const mergedMemoryDeltas: MemoryDeltaItem[][] = [];
    const requestIds: string[] = [];
    let lastProviderType: string | undefined;
    let lastTelemetry = {
      packMode,
      notebookId: null as string | null,
      localKnowledgeVersion: 0,
      notebookVerifiedVersion: 0,
      hotDeltaCount: 0,
    };

    // Work queue so soft-error chunks can be split and re-queued.
    type Para = (typeof paragraphs)[number];
    const queue: Para[][] = chunks.map((c) => [...c]);
    let sendOrdinal = 0;
    /** Upper bound for progress UI (grows when we split). */
    let progressTotal = Math.max(1, chunks.length);

    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) break;
      sendOrdinal += 1;
      const paragraphIds = chunk.map((p) => p.paragraphId);
      this.writeSendProgress(ctx, {
        phase: 'sending',
        chunkIndex: sendOrdinal,
        chunkTotal: progressTotal,
        paragraphsDone: merged.length,
        paragraphsTotal: totalParas,
        ...lastTelemetry,
        providerType: lastProviderType,
      });

      let chunkLines: TranslationLine[] = [];
      let chunkTermDeltas: TermDeltaItem[] = [];
      let chunkMemoryDeltas: MemoryDeltaItem[] = [];
      let lastRaw = '';
      let lastRequestId = '';
      let lastFailStatus: string | null = null;
      let lastFailMsg = '';
      let lastErrorCode: string | null = null;

      for (let attempt = 0; attempt <= CHUNK_SEND_RETRIES; attempt += 1) {
        this.db.jobs.updateState(ctx.job.id, 'SENDING');
        this.writeSendProgress(ctx, {
          phase: 'sending',
          chunkIndex: sendOrdinal,
          chunkTotal: progressTotal,
          paragraphsDone: merged.length,
          paragraphsTotal: totalParas,
          ...lastTelemetry,
          providerType: lastProviderType,
        });

        const pack = this.buildPackForJob(
          ctx,
          paragraphIds,
          packMode,
          lastProviderType ?? firstProviderType,
        );
        lastTelemetry = this.packTelemetryFields(pack);
        if (sendOrdinal === 1 && attempt === 0) {
          this.recordPackDiagnostics(
            ctx,
            pack,
            lastProviderType ?? firstProviderType ?? null,
            {
              phase: 'sending',
              chunkIndex: sendOrdinal,
              chunkTotal: progressTotal,
              paragraphsDone: merged.length,
              paragraphsTotal: totalParas,
            },
          );
        }
        this.db.jobs.updateState(ctx.job.id, 'WAITING_AI');
        this.writeSendProgress(ctx, {
          phase: 'waiting_ai',
          chunkIndex: sendOrdinal,
          chunkTotal: progressTotal,
          paragraphsDone: merged.length,
          paragraphsTotal: totalParas,
          ...lastTelemetry,
          providerType: lastProviderType,
        });

        const response = await this.sendWithFallback(pack, {
          projectId: ctx.job.project_id,
          googleAccountId: ctx.accountId,
          jobId: ctx.job.id,
          requestId: newId(),
          pinnedProviderId:
            (config as { pinnedProviderId?: string }).pinnedProviderId ?? null,
        });

        if (response.status !== 'SUCCESS') {
          lastFailStatus = response.status;
          lastFailMsg =
            response.errorMessage ?? userMessageForStatus(response.status);
          lastErrorCode = response.errorCode ?? null;
          const transient = TRANSIENT_CHUNK_STATUSES.has(response.status);
          logger.warn('Chunk send failed', {
            jobId: ctx.job.id,
            chunk: sendOrdinal,
            chunkTotal: progressTotal,
            attempt: attempt + 1,
            maxAttempts: CHUNK_SEND_RETRIES + 1,
            status: response.status,
            errorCode: response.errorCode,
            transient,
            message: lastFailMsg,
          });
          if (transient && attempt < CHUNK_SEND_RETRIES) {
            // Soft errors need longer cooldown than network blips.
            const soft =
              response.errorCode === 'GEMINI_SOFT_ERROR' ||
              /something went wrong/i.test(lastFailMsg);
            const base = soft ? 4_000 : 2_000;
            await sleepMs(base * (attempt + 1));
            continue;
          }
          break;
        }

        lastRaw = response.text;
        lastRequestId = response.requestId;
        lastFailStatus = null;
        lastFailMsg = '';
        lastErrorCode = null;
        if (response.providerType) lastProviderType = response.providerType;
        const parsed = parser.parse(response.text);
        if (parsed.translations.length > 0) {
          const finalized = await this.finalizeChunkWithContinuation(ctx, {
            raw: response.text,
            paragraphIds,
            batchParagraphs: paragraphs,
            packMode,
            chunkIndex: sendOrdinal,
            chunkTotal: progressTotal,
            paragraphsDone: merged.length,
            paragraphsTotal: totalParas,
            providerType: response.providerType,
          });
          chunkLines = finalized.translations;
          chunkTermDeltas = finalized.termDeltas;
          chunkMemoryDeltas = finalized.memoryDeltas;
          lastRaw = finalized.raw;
          break;
        }

        logger.warn('Chunk returned SUCCESS but no translation lines', {
          jobId: ctx.job.id,
          chunk: sendOrdinal,
          chunkTotal: progressTotal,
          attempt: attempt + 1,
          maxAttempts: CHUNK_SEND_RETRIES + 1,
          snippet: protocolFailSnippet(response.text),
          parseStatus: parsed.status,
        });
        if (attempt < CHUNK_SEND_RETRIES) {
          await sleepMs(1_500 * (attempt + 1));
        }
      }

      if (chunkLines.length === 0) {
        const canSplit =
          chunk.length > 1 &&
          (lastFailStatus == null ||
            TRANSIENT_CHUNK_STATUSES.has(lastFailStatus) ||
            lastErrorCode === 'GEMINI_SOFT_ERROR');
        const halves = canSplit ? splitParagraphChunkInHalf(chunk) : null;
        if (halves) {
          logger.warn('Splitting soft-failed chunk and retrying halves', {
            jobId: ctx.job.id,
            chunk: sendOrdinal,
            fromSize: chunk.length,
            left: halves[0].length,
            right: halves[1].length,
            status: lastFailStatus,
            errorCode: lastErrorCode,
          });
          progressTotal += 1;
          queue.unshift(halves[1], halves[0]);
          await sleepMs(3_000);
          continue;
        }
        throw new Error(
          lastFailStatus
            ? `${lastFailStatus}: Lô ${sendOrdinal}/${progressTotal} thất bại — ${lastFailMsg}`
            : `Lô ${sendOrdinal}/${progressTotal} không trả về đoạn dịch (phản hồi rỗng / sai protocol). ` +
                `Snippet: ${protocolFailSnippet(lastRaw)}`,
        );
      }

      requestIds.push(lastRequestId || newId());
      merged.push(...chunkLines);
      mergedTermDeltas.push(chunkTermDeltas);
      mergedMemoryDeltas.push(chunkMemoryDeltas);
      this.writeSendProgress(ctx, {
        phase: 'sending',
        chunkIndex: sendOrdinal,
        chunkTotal: progressTotal,
        paragraphsDone: merged.length,
        paragraphsTotal: totalParas,
        ...lastTelemetry,
        providerType: lastProviderType,
      });

      // Pace Web API between chunks to avoid "Sorry, something went wrong" streaks.
      if (
        queue.length > 0 &&
        (lastProviderType === 'GEMINI_WEB_API' || !playwrightFirst)
      ) {
        await sleepMs(WEB_API_INTER_CHUNK_DELAY_MS);
      }
    }

    this.writeSendProgress(ctx, {
      phase: 'waiting_ai',
      chunkIndex: sendOrdinal,
      chunkTotal: progressTotal,
      paragraphsDone: merged.length,
      paragraphsTotal: totalParas,
      ...lastTelemetry,
      providerType: lastProviderType,
    });

    return {
      rawResponse: buildMergedTranslationProtocol(
        merged,
        mergeTermDeltas(mergedTermDeltas),
        mergeMemoryDeltas(mergedMemoryDeltas),
      ),
      inputRef: `corr:${requestIds[0] ?? newId()}+${requestIds.length}chunks`,
    };
  }

  /**
   * Web API must never pretend Notebook cold sources exist — always SQLite fat pack.
   * Playwright Translation Notebook → SLIM (verified) or HYBRID (pending/stale/mismatch).
   */
  private resolvePackMode(
    ctx: JobExecuteContext,
    providerType?: string,
  ): PackMode {
    return resolveTranslationPackMode(this.db, {
      projectId: ctx.job.project_id,
      accountId: ctx.accountId,
      providerType,
    }).packMode;
  }

  /**
   * Ensure pack matches provider context rules when falling back mid-flight.
   * REPAIR / CONTINUATION: swap baseContext only — never rewrite operationPrompt.
   */
  private adaptPackForProvider(
    pack: TranslationPackDto,
    provider: IAIProvider,
    options?: SendPromptOptions,
  ): TranslationPackDto {
    if (provider.providerType !== 'GEMINI_WEB_API') {
      return pack;
    }
    const projectId = options?.projectId ?? pack.projectId;
    const accountId = options?.googleAccountId ?? undefined;
    if (!projectId || pack.chapterIds.length === 0) {
      return pack;
    }

    const preserveOp =
      options?.preserveRepairPrompt === true ||
      isRepairOrContinuationOp(pack.operationType);

    try {
      const fat = getTranslationPackService().build({
        projectId,
        chapterIds: pack.chapterIds,
        paragraphIds: undefined,
        googleAccountId: accountId ?? undefined,
        providerType: 'GEMINI_WEB_API',
        packMode: 'fat',
        forceFatPack: true,
      });

      if (!preserveOp) {
        // Normal TRANSLATE fallback — full FAT rebuild is correct.
        return fat;
      }

      // Keep operationPrompt byte-stable; only rebuild FAT baseContext.
      const preservedOp =
        pack.operationPrompt.trim() || extractOperationPrompt(pack);
      const operationType: TranslationPackOperation =
        pack.operationType === 'CONTINUATION' ? 'CONTINUATION' : 'REPAIR';
      const repairBody = preservedOp
        .replace(/^## (?:Repair \/ continuation|Continuation) task\s*/i, '')
        .trim();
      const split = splitRepairChannelPrompt({
        repairBody,
        operationType,
        packMode: 'fat',
        webApiFat: true,
        fatSections: {
          criticalRules: fat.sections.criticalRules,
          hotMemoryDelta: fat.sections.hotMemoryDelta,
          activeProjectTerms: fat.sections.activeProjectTerms,
        },
      });
      // Prefer original operationPrompt when already structured.
      const operationPrompt =
        pack.operationPrompt.trim() || split.operationPrompt;
      const prompt = assemblePackPrompt({
        baseContext: split.baseContext,
        operationPrompt,
      });

      return {
        ...fat,
        baseContext: split.baseContext,
        operationPrompt,
        operationType,
        prompt,
        promptHash: `repair-fat:${pack.promptHash}`,
        sections: {
          ...fat.sections,
          taskHeader: formatSafeTaskHeader(operationType),
          sourceParagraphs: '',
          outputProtocol: '',
        },
      };
    } catch (error) {
      logger.warn('Failed to rebuild fat pack for Web API — using original', {
        message: error instanceof Error ? error.message : String(error),
      });
      return pack;
    }
  }

  private async finalizeChunkWithContinuation(
    ctx: JobExecuteContext,
    input: {
      raw: string;
      paragraphIds: string[];
      batchParagraphs: RepairParagraph[];
      packMode: PackMode;
      chunkIndex: number;
      chunkTotal: number;
      paragraphsDone: number;
      paragraphsTotal: number;
      providerType?: string;
    },
  ): Promise<{
    raw: string;
    translations: TranslationLine[];
    termDeltas: TermDeltaItem[];
    memoryDeltas: MemoryDeltaItem[];
  }> {
    const parser = new ResponseParser();
    const initialParsed = parser.parse(input.raw);
    const completeness = assessBatchCompleteness(
      input.raw,
      initialParsed,
      input.paragraphIds,
    );
    if (
      !completeness.incomplete ||
      completeness.missingCount === 0 ||
      !initialParsed.translations.some((t) => t.text.trim())
    ) {
      return {
        raw: input.raw,
        translations: initialParsed.translations,
        termDeltas: initialParsed.termDeltas,
        memoryDeltas: initialParsed.memoryDeltas,
      };
    }

    const config = parseJobConfig(ctx.job.config);
    const chunkParagraphs = input.batchParagraphs.filter((p) =>
      input.paragraphIds.includes(p.paragraphId),
    );
    const channel = this.resolveRepairChannel(ctx.job.id, ctx.accountId, {
      providerType: input.providerType ?? null,
      packMode: input.packMode,
    });
    const result = await runContinuationLoop({
      batchParagraphs: chunkParagraphs,
      sourceParagraphIds: input.paragraphIds,
      initialRaw: input.raw,
      maxAttempts: config.maxContinuationAttempts ?? DEFAULT_MAX_CONTINUATION_ATTEMPTS,
      parser,
      persistPartial: (raw, meta) => { this.persistPartialRaw(ctx.job.id, raw, meta); },
      onProgress: (p) => { this.writeSendProgress(ctx, {
          phase: 'continuation',
          chunkIndex: input.chunkIndex,
          chunkTotal: input.chunkTotal,
          paragraphsDone: input.paragraphsDone,
          paragraphsTotal: input.paragraphsTotal,
          packMode: channel.packMode ?? input.packMode,
          providerType: channel.providerType ?? input.providerType,
          notebookId: channel.notebookId,
          continuationRound: p.continuationRound,
          lastCompletedParagraphId: p.lastCompletedParagraphId,
        }); },
      sendContinuation: async (prompt, requestId) => {
        try {
          const sent = await this.sendRepairOrContinuation({
            jobId: ctx.job.id,
            projectId: ctx.job.project_id,
            accountId: ctx.accountId,
            repairBody: prompt,
            channel,
            requestId,
            lockedTerms: config.lockedTerms,
            targetParagraphIds: input.paragraphIds,
            operationType: 'CONTINUATION',
          });
          return {
            text: sent.rawResponse,
            requestId: sent.inputRef.replace(/^corr:/, ''),
            status: 'SUCCESS' as const,
          };
        } catch (error) {
          logger.warn('Continuation send failed', {
            jobId: ctx.job.id,
            message: error instanceof Error ? error.message : String(error),
          });
          return {
            text: '',
            requestId,
            status: 'ERROR',
          };
        }
      },
    });

    return {
      raw: result.rawResponse,
      translations: result.translations,
      termDeltas: result.termDeltas,
      memoryDeltas: result.memoryDeltas,
    };
  }

  private persistPartialRaw(
    jobId: string,
    raw: string,
    meta: { round: number; label: string },
  ): void {
    const existing = this.db.jobs.listAttempts(jobId);
    const attemptNumber =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((a) => a.attempt_number)) + 1;
    const truncated =
      raw.length <= 50_000 ? raw : `${raw.slice(0, 50_000)}\n...[truncated]`;
    const attempt = this.db.jobs.startAttempt({
      job_id: jobId,
      attempt_number: attemptNumber,
      reason: 'PARTIAL_RAW',
      input_ref: null,
      state: 'RUNNING',
    });
    this.db.jobs.completeAttempt(attempt.id, {
      state: 'SUCCEEDED',
      output: truncated,
      result: JSON.stringify({ phase: 'partial_raw', ...meta }),
    });
  }

  private writeSendProgress(
    ctx: JobExecuteContext,
    progress: {
      phase: string;
      chunkIndex: number;
      chunkTotal: number;
      paragraphsDone: number;
      paragraphsTotal: number;
      packMode?: PackMode;
      providerType?: string;
      continuationRound?: number;
      lastCompletedParagraphId?: string | null;
      notebookId?: string | null;
      localKnowledgeVersion?: number;
      notebookVerifiedVersion?: number;
      hotDeltaCount?: number;
      diagnostics?: TranslationContextDiagnostics | null;
      timelineEvent?: { event: string; message?: string };
    },
  ): void {
    const job = this.db.jobs.getById(ctx.job.id);
    let existing: Record<string, unknown> = {};
    if (job?.progress) {
      try {
        existing = JSON.parse(job.progress) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }

    const diagnostics =
      progress.diagnostics ??
      (progress.packMode
        ? buildTranslationContextDiagnostics(this.db, {
            projectId: ctx.job.project_id,
            accountId: ctx.accountId,
            providerType: progress.providerType ?? null,
            packDecision: {
              packMode: progress.packMode,
              notebookId: progress.notebookId ?? null,
              localKnowledgeVersion: progress.localKnowledgeVersion ?? 0,
              notebookVerifiedVersion: progress.notebookVerifiedVersion ?? 0,
              sourceGroundingConfirmed: progress.packMode === 'slim',
              reason: progress.packMode === 'slim' ? 'ready_verified' : progress.packMode,
              hotDeltaCount: progress.hotDeltaCount ?? 0,
            },
            threadRef:
              typeof existing.threadRef === 'string' ? existing.threadRef : null,
          })
        : null);

    const { diagnostics: _d, timelineEvent, ...rest } = progress;
    void _d;

    if (diagnostics) {
      mergeJobProgressDiagnostics(
        this.db,
        ctx.job.id,
        diagnostics,
        timelineEvent,
      );
      // Re-merge phase/chunk fields after diagnostics write
      const refreshed = this.db.jobs.getById(ctx.job.id);
      let base: Record<string, unknown> = {};
      if (refreshed?.progress) {
        try {
          base = JSON.parse(refreshed.progress) as Record<string, unknown>;
        } catch {
          base = {};
        }
      }
      this.db.jobs.updateProgress(
        ctx.job.id,
        JSON.stringify({
          ...base,
          ...rest,
          ...diagnostics,
          accountId: ctx.accountId,
          notebookVerifiedVersion: diagnostics.notebookKnowledgeVersion,
        }),
      );
      return;
    }

    this.db.jobs.updateProgress(
      ctx.job.id,
      JSON.stringify({
        ...existing,
        ...rest,
        accountId: ctx.accountId,
      }),
    );
  }

  private packTelemetryFields(pack: TranslationPackBuildResult): {
    packMode: PackMode;
    notebookId: string | null;
    localKnowledgeVersion: number;
    notebookVerifiedVersion: number;
    hotDeltaCount: number;
  } {
    return {
      packMode: pack.packMode,
      notebookId: pack.packTelemetry.notebookId,
      localKnowledgeVersion: pack.packTelemetry.localKnowledgeVersion,
      notebookVerifiedVersion: pack.packTelemetry.notebookVerifiedVersion,
      hotDeltaCount: pack.packTelemetry.hotDeltaCount,
    };
  }

  /** Emit diagnostics + PACK_MODE_SELECTED / grounding events for a pack send. */
  private recordPackDiagnostics(
    ctx: JobExecuteContext,
    pack: TranslationPackBuildResult,
    providerType: string | null,
    phaseProgress: {
      phase: string;
      chunkIndex: number;
      chunkTotal: number;
      paragraphsDone: number;
      paragraphsTotal: number;
    },
  ): TranslationContextDiagnostics {
    const diagnostics = buildTranslationContextDiagnostics(this.db, {
      projectId: ctx.job.project_id,
      accountId: ctx.accountId,
      providerType,
      packDecision: {
        ...pack.packTelemetry,
        packMode: pack.packMode,
        hotDeltaCount: pack.packTelemetry.hotDeltaCount,
      },
    });

    mergeJobProgressDiagnostics(this.db, ctx.job.id, diagnostics, {
      event: 'PACK_MODE_SELECTED',
      message: `${diagnostics.packMode?.toUpperCase() ?? '?'} — ${diagnostics.knowledgeSourceMode}`,
    });
    logJobKnowledgeEvent(this.db, {
      projectId: ctx.job.project_id,
      jobId: ctx.job.id,
      eventType: 'PACK_MODE_SELECTED',
      message: `Pack mode ${diagnostics.packMode} (${diagnostics.knowledgeSourceMode})`,
      diagnostics,
    });

    if (diagnostics.notebookId && diagnostics.providerType === 'PLAYWRIGHT_GEMINI') {
      mergeJobProgressDiagnostics(this.db, ctx.job.id, diagnostics, {
        event: 'TRANSLATION_NOTEBOOK_OPENED',
        message: diagnostics.notebookName ?? diagnostics.notebookId,
      });
      logJobKnowledgeEvent(this.db, {
        projectId: ctx.job.project_id,
        jobId: ctx.job.id,
        eventType: 'TRANSLATION_NOTEBOOK_OPENED',
        message: diagnostics.notebookName ?? 'Translation Notebook',
        diagnostics,
      });
    }

    if (diagnostics.notebookGroundingVerified) {
      mergeJobProgressDiagnostics(this.db, ctx.job.id, diagnostics, {
        event: 'NOTEBOOK_GROUNDING_VERIFIED',
        message: `v${diagnostics.notebookKnowledgeVersion}`,
      });
      logJobKnowledgeEvent(this.db, {
        projectId: ctx.job.project_id,
        jobId: ctx.job.id,
        eventType: 'NOTEBOOK_GROUNDING_VERIFIED',
        message: 'Notebook grounding verified for this job',
        diagnostics,
      });
    }

    this.writeSendProgress(ctx, {
      ...phaseProgress,
      ...this.packTelemetryFields(pack),
      providerType: providerType ?? undefined,
      diagnostics,
      timelineEvent: { event: 'PROMPT_SENT', message: phaseProgress.phase },
    });
    logJobKnowledgeEvent(this.db, {
      projectId: ctx.job.project_id,
      jobId: ctx.job.id,
      eventType: 'PROMPT_SENT',
      message: `Prompt sent (${diagnostics.packMode})`,
      diagnostics,
    });

    return diagnostics;
  }

  async sendRepair(request: RepairSendRequest): Promise<RepairSendResult> {
    const job = this.db.jobs.getById(request.jobId);
    if (!job) throw new Error(`Job not found: ${request.jobId}`);

    const repairBody = request.plan?.prompt ?? request.initialPrompt ?? '';
    if (!repairBody) throw new Error('Repair send missing prompt');

    const channel = this.resolveRepairChannel(
      request.jobId,
      request.channel?.accountId ?? job.pinned_account_id,
      request.channel,
    );
    const config = parseJobConfig(job.config);
    const targetIds =
      request.plan?.targetParagraphIds.length
        ? request.plan.targetParagraphIds
        : config.sourceParagraphIds;

    return this.sendRepairOrContinuation({
      jobId: job.id,
      projectId: job.project_id,
      accountId: channel.accountId ?? job.pinned_account_id,
      repairBody,
      channel,
      lockedTerms: config.lockedTerms,
      targetParagraphIds: targetIds,
      operationType: 'REPAIR',
    });
  }

  /**
   * Shared send path for repair + continuation: same account / notebook / provider,
   * WebAPI failover rebuilds FAT local memory around the repair body.
   */
  private async sendRepairOrContinuation(input: {
    jobId: string;
    projectId: string;
    accountId: string | null;
    repairBody: string;
    channel: RepairChannelContext;
    requestId?: string;
    lockedTerms?: { source: string; preferred: string; paragraphIds?: string[] }[];
    targetParagraphIds?: string[];
    operationType?: TranslationPackOperation;
  }): Promise<RepairSendResult> {
    const preferredType = input.channel.providerType ?? 'PLAYWRIGHT_GEMINI';
    const preferPlaywright = preferredType === 'PLAYWRIGHT_GEMINI';
    const operationType = input.operationType ?? 'REPAIR';

    const locked = (input.lockedTerms ?? []).map((t) => ({
      source: t.source,
      preferred: t.preferred,
    }));
    const hotMemory = this.buildHotMemoryForRepair(input.projectId, input.accountId);

    const notebookPack = this.buildChannelRepairPack({
      projectId: input.projectId,
      jobId: input.jobId,
      repairBody: input.repairBody,
      channel: input.channel,
      lockedTerms: locked,
      hotMemoryText: hotMemory,
      webApiFat: false,
      targetParagraphIds: input.targetParagraphIds,
      operationType,
    });

    if (preferPlaywright) {
      const playwrightResponse = await this.sendWithFallback(notebookPack, {
        projectId: input.projectId,
        googleAccountId: input.accountId,
        jobId: input.jobId,
        requestId: input.requestId ?? newId(),
        pinnedProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        preserveRepairPrompt: true,
        notebookId: input.channel.notebookId,
        threadRef: input.channel.threadRef,
      });

      if (playwrightResponse.status === 'SUCCESS' && playwrightResponse.text.trim()) {
        const used: RepairChannelContext = {
          ...input.channel,
          providerType: 'PLAYWRIGHT_GEMINI',
          accountId: input.accountId,
          packMode: input.channel.packMode ?? 'slim',
        };
        this.persistChannelOnJobProgress(input.jobId, used);
        return {
          rawResponse: playwrightResponse.text,
          inputRef: `corr:${playwrightResponse.requestId}`,
          channel: used,
        };
      }

      // Soft retry once on same channel
      const soft =
        playwrightResponse.errorCode === 'GEMINI_SOFT_ERROR' ||
        isGeminiSoftErrorText(playwrightResponse.errorMessage) ||
        /something went wrong|hard time fulfilling/i.test(
          playwrightResponse.errorMessage ?? '',
        );
      if (soft) {
        await new Promise((r) => setTimeout(r, 5_000));
        const retry = await this.sendWithFallback(notebookPack, {
          projectId: input.projectId,
          googleAccountId: input.accountId,
          jobId: input.jobId,
          requestId: newId(),
          pinnedProviderId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
          preserveRepairPrompt: true,
          notebookId: input.channel.notebookId,
          threadRef: input.channel.threadRef,
        });
        if (retry.status === 'SUCCESS' && retry.text.trim()) {
          const used: RepairChannelContext = {
            ...input.channel,
            providerType: 'PLAYWRIGHT_GEMINI',
            accountId: input.accountId,
          };
          this.persistChannelOnJobProgress(input.jobId, used);
          return {
            rawResponse: retry.text,
            inputRef: `corr:${retry.requestId}`,
            channel: used,
          };
        }
      }

      if (!this.isFallbackEnabled()) {
        throw new Error(
          playwrightResponse.errorMessage ??
            userMessageForStatus(playwrightResponse.status),
        );
      }

      logger.info('Repair failover Playwright → WebAPI FAT', {
        jobId: input.jobId,
        status: playwrightResponse.status,
        operationType,
      });
    }

    // WebAPI (initial or failover): FAT local memory — never assume Notebook.
    const fatPack = this.buildChannelRepairPack({
      projectId: input.projectId,
      jobId: input.jobId,
      repairBody: input.repairBody,
      channel: { ...input.channel, packMode: 'fat', providerType: 'GEMINI_WEB_API' },
      lockedTerms: locked,
      hotMemoryText: hotMemory,
      webApiFat: true,
      targetParagraphIds: input.targetParagraphIds,
      operationType,
    });
    const webResponse = await this.sendWithFallback(fatPack, {
      projectId: input.projectId,
      googleAccountId: input.accountId,
      jobId: input.jobId,
      requestId: input.requestId ?? newId(),
      pinnedProviderId: AI_PROVIDER_IDS.GEMINI_WEB_API,
      preserveRepairPrompt: true,
    });
    if (webResponse.status !== 'SUCCESS' || !webResponse.text.trim()) {
      throw new Error(
        webResponse.errorMessage ?? userMessageForStatus(webResponse.status),
      );
    }
    const used: RepairChannelContext = {
      providerType: 'GEMINI_WEB_API',
      accountId: input.accountId,
      notebookId: null,
      threadRef: null,
      packMode: 'fat',
      knowledgeVersion: input.channel.knowledgeVersion,
    };
    this.persistChannelOnJobProgress(input.jobId, used);
    return {
      rawResponse: webResponse.text,
      inputRef: `corr:${webResponse.requestId}`,
      channel: used,
    };
  }

  private resolveRepairChannel(
    jobId: string,
    accountId: string | null | undefined,
    override?: Partial<RepairChannelContext> | null,
  ): RepairChannelContext {
    const job = this.db.jobs.getById(jobId);
    const fromProgress = readRepairChannelFromProgress(job?.progress);
    const latestReq = this.db.geminiRequests.findLatestByJob(jobId);
    const mapping =
      accountId || fromProgress.accountId
        ? resolveTranslationNotebook(
            this.db,
            job?.project_id ?? '',
            accountId ?? fromProgress.accountId ?? '',
          )
        : null;

    return {
      providerType:
        override?.providerType ??
        fromProgress.providerType ??
        'PLAYWRIGHT_GEMINI',
      accountId:
        override?.accountId ??
        fromProgress.accountId ??
        accountId ??
        job?.pinned_account_id ??
        null,
      notebookId:
        override?.notebookId ??
        fromProgress.notebookId ??
        latestReq?.notebook_id ??
        mapping?.notebook_id ??
        mapping?.id ??
        null,
      threadRef:
        override?.threadRef ??
        fromProgress.threadRef ??
        latestReq?.thread_ref ??
        latestReq?.correlation_id ??
        null,
      packMode: override?.packMode ?? fromProgress.packMode ?? 'slim',
      knowledgeVersion:
        override?.knowledgeVersion ??
        fromProgress.knowledgeVersion ??
        mapping?.knowledge_version ??
        null,
    };
  }

  private persistChannelOnJobProgress(
    jobId: string,
    channel: RepairChannelContext,
  ): void {
    const job = this.db.jobs.getById(jobId);
    let existing: Record<string, unknown> = {};
    if (job?.progress) {
      try {
        existing = JSON.parse(job.progress) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }
    this.db.jobs.updateProgress(
      jobId,
      JSON.stringify({
        ...existing,
        ...channelSnapshotForAttempt(channel),
        localKnowledgeVersion:
          channel.knowledgeVersion ?? existing.localKnowledgeVersion,
      }),
    );
  }

  private buildHotMemoryForRepair(
    projectId: string,
    _accountId: string | null,
  ): string {
    try {
      const sync = getNotebookSyncService(this.db);
      return sync.buildActiveHotMemoryText(projectId) || '';
    } catch {
      return '';
    }
  }

  private buildChannelRepairPack(input: {
    projectId: string;
    jobId: string;
    repairBody: string;
    channel: RepairChannelContext;
    lockedTerms: { source: string; preferred: string }[];
    hotMemoryText: string;
    webApiFat: boolean;
    targetParagraphIds?: string[];
    operationType?: TranslationPackOperation;
  }): TranslationPackDto {
    const job = this.db.jobs.getById(input.jobId);
    const chapterIds = this.resolveJobChapterIds(input.projectId, job);
    const operationType = input.operationType ?? 'REPAIR';
    let fatSections: {
      criticalRules?: string;
      hotMemoryDelta?: string;
      activeProjectTerms?: string;
    } | null = null;

    if (input.webApiFat && chapterIds.length > 0) {
      try {
        const fat = getTranslationPackService().build({
          projectId: input.projectId,
          chapterIds,
          paragraphIds: input.targetParagraphIds,
          googleAccountId: input.channel.accountId ?? undefined,
          providerType: 'GEMINI_WEB_API',
          packMode: 'fat',
          forceFatPack: true,
        });
        fatSections = {
          criticalRules: fat.sections.criticalRules,
          hotMemoryDelta: fat.sections.hotMemoryDelta,
          activeProjectTerms: fat.sections.activeProjectTerms,
        };
      } catch (error) {
        logger.warn('FAT repair context build failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const split = splitRepairChannelPrompt({
      repairBody: input.repairBody,
      operationType,
      packMode: input.webApiFat ? 'fat' : input.channel.packMode,
      lockedTerms: input.lockedTerms,
      hotMemoryText: input.webApiFat ? null : input.hotMemoryText,
      notebookId: input.webApiFat ? null : input.channel.notebookId,
      fatSections,
      webApiFat: input.webApiFat,
    });

    const base =
      chapterIds.length > 0
        ? this.buildMinimalPack(
            input.projectId,
            split,
            operationType,
            job ?? { chapter_from: null, chapter_to: null },
          )
        : null;

    if (base) return base;

    return {
      projectId: input.projectId,
      chapterIds: chapterIds.length ? chapterIds : [newId()],
      chapterNumbers: [],
      style: 'balanced',
      prompt: split.prompt,
      baseContext: split.baseContext,
      operationPrompt: split.operationPrompt,
      operationType,
      sections: {
        taskHeader: '',
        criticalRules: '',
        hotMemoryDelta: '',
        activeProjectTerms: '',
        sourceParagraphs: '',
        outputProtocol: '',
      },
      size: {
        sourceChars: split.operationPrompt.length,
        contextChars: split.baseContext.length,
        totalChars: split.prompt.length,
        estimatedTokens: Math.ceil(split.prompt.length / 4),
        activeTermCount: 0,
        activeCharacterCount: 0,
        relationshipCount: 0,
        recentMemoryCount: 0,
        paragraphCount: 0,
        chapterCount: 1,
      },
      promptHash: newId().slice(0, 16),
    };
  }

  private resolveJobChapterIds(
    projectId: string,
    job: { chapter_from: number | null; chapter_to: number | null } | null | undefined,
  ): string[] {
    const chapters = this.db.chapters.listByProject(projectId);
    const chapterFrom = job?.chapter_from;
    const chapterTo = job?.chapter_to;
    if (chapterFrom != null && chapterTo != null) {
      return chapters
        .filter((c) => {
          const n = c.chapter_number ?? c.sequence_order;
          return n >= chapterFrom && n <= chapterTo;
        })
        .map((c) => c.id)
        .slice(0, DEFAULT_MAX_CHAPTERS_PER_JOB);
    }
    return chapters[0] ? [chapters[0].id] : [];
  }

  private buildPackForJob(
    ctx: JobExecuteContext,
    paragraphIds?: string[],
    packMode: PackMode = 'fat',
    providerType?: string,
  ): TranslationPackBuildResult {
    const config = parseJobConfig(ctx.job.config);
    let chapterIds = config.chapterIds ?? [];

    if (chapterIds.length === 0) {
      const from = ctx.job.chapter_from;
      const to = ctx.job.chapter_to;
      if (from != null && to != null) {
        const chapters = this.db.chapters.listByProject(ctx.job.project_id);
        chapterIds = chapters
          .filter((c) => {
            const n = c.chapter_number ?? c.sequence_order;
            return n >= from && n <= to;
          })
          .map((c) => c.id);
      }
    }

    const ids =
      paragraphIds && paragraphIds.length > 0
        ? paragraphIds
        : config.sourceParagraphIds.length > 0
          ? config.sourceParagraphIds
          : config.batchParagraphs.map((p) => p.paragraphId);

    if (chapterIds.length === 0 && ids.length > 0) {
      const para = this.db.paragraphs.getById(ids[0]);
      if (para) chapterIds = [para.chapter_id];
    }

    if (chapterIds.length === 0) {
      throw new Error('Cannot build TranslationPack: no chapterIds for job');
    }

    const limited = chapterIds.slice(0, DEFAULT_MAX_CHAPTERS_PER_JOB);

    return getTranslationPackService().build({
      projectId: ctx.job.project_id,
      chapterIds: limited,
      paragraphIds: ids.length > 0 ? ids : undefined,
      googleAccountId: ctx.accountId,
      providerType,
      packMode,
      forceFatPack: packMode === 'fat',
    });
  }

  private buildMinimalPack(
    projectId: string,
    split: { baseContext: string; operationPrompt: string; prompt: string },
    operationType: TranslationPackOperation,
    job: { chapter_from: number | null; chapter_to: number | null },
  ): TranslationPackDto {
    const chapters = this.db.chapters.listByProject(projectId);
    let chapterIds: string[] = [];
    const chapterFrom = job.chapter_from;
    const chapterTo = job.chapter_to;
    if (chapterFrom != null && chapterTo != null) {
      chapterIds = chapters
        .filter((c) => {
          const n = c.chapter_number ?? c.sequence_order;
          return n >= chapterFrom && n <= chapterTo;
        })
        .map((c) => c.id)
        .slice(0, DEFAULT_MAX_CHAPTERS_PER_JOB);
    }
    if (chapterIds.length === 0 && chapters[0]) {
      chapterIds = [chapters[0].id];
    }

    // Do NOT call TranslationPackService.build() here — that yields a TRANSLATE
    // FAT pack whose sections/prompt would mask REPAIR/CONTINUATION.
    return {
      projectId,
      chapterIds: chapterIds.length ? chapterIds : [newId()],
      chapterNumbers: [],
      style: 'balanced',
      prompt: split.prompt,
      baseContext: split.baseContext,
      operationPrompt: split.operationPrompt,
      operationType,
      sections: {
        taskHeader: formatSafeTaskHeader(operationType),
        criticalRules: '',
        hotMemoryDelta: '',
        activeProjectTerms: '',
        sourceParagraphs: '',
        outputProtocol: '',
      },
      size: {
        sourceChars: split.operationPrompt.length,
        contextChars: split.baseContext.length,
        totalChars: split.prompt.length,
        estimatedTokens: Math.ceil(split.prompt.length / 4),
        activeTermCount: 0,
        activeCharacterCount: 0,
        relationshipCount: 0,
        recentMemoryCount: 0,
        paragraphCount: 0,
        chapterCount: Math.max(1, chapterIds.length),
      },
      promptHash: `repair:${newId().slice(0, 12)}`,
    };
  }
}

function formatSafeTaskHeader(operationType: TranslationPackOperation): string {
  return operationType === 'CONTINUATION' ? 'Continuation' : 'Repair';
}

export function providerTypeLabel(type: AiProviderType): string {
  switch (type) {
    case 'GEMINI_WEB_API':
      return 'Gemini Web API';
    case 'PLAYWRIGHT_GEMINI':
      return 'Gemini Browser';
    case 'GEMINI_OFFICIAL':
      return 'Gemini Official API';
    default:
      return type;
  }
}

export { AI_PROVIDER_IDS };
