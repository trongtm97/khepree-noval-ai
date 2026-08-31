import type { DatabaseManager } from '../db/database-manager';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import {
  AI_FALLBACK_META_KEYS,
  AI_PROVIDER_IDS,
  AI_RESPONSE_STATUSES,
  AUTH_FALLBACK_STATUSES,
  DEFAULT_FALLBACK_STATUSES,
  isBrowserAiAccountProvider,
  type AiProviderType,
  type AiResponseStatus,
} from '@shared/constants/ai-provider';
import {
  AI_ROUTING_META_KEYS,
  type AiRoutingMode,
} from '@shared/constants/provider-preflight';
import type { IAIProvider } from './iai-provider';
import type { AIResponse, SendPromptOptions } from './types';
import { classifyAiResponseText, isAiSoftErrorText } from '@shared/utils/provider-response-classifier';
import { userMessageForStatus } from './error-map';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import type { JobExecuteContext, InitialSendResult } from '../jobs/batch-executor';
import type { RepairSendRequest, RepairSendResult } from '../jobs/repair-loop';
import { getTranslationPackService } from '../services/translation-pack-service-singleton';
import { resolveTranslationNotebook } from '../notebook/notebook-resolver';
import type { PackMode } from '@shared/constants/pack-mode';
import { readPreferNotebookPack } from '@shared/constants/project-style-config';
import { resolveTranslationPackMode } from '../prompt/pack-mode-resolver';
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
  splitRepairChannelPrompt,
} from '../prompt/pack-operation';
import type { TranslationPackOperation } from '@shared/constants/translation-pack';
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
import { resolveJobKnowledgeSnapshot } from '../knowledge/knowledge-version';
import { resolveForProjectEdition } from '../services/translation-language-resolver';
import {
  buildRepairTranslationContext,
  repairContextSnapshot,
  lastAcceptedTargetParagraphs,
} from '../jobs/repair-translation-context';
import { resolvePrimaryProviderId } from './primary-provider-policy';
import { reorderProvidersWithPrimary } from '@shared/constants/translation-ai-providers';
import {
  type AiExecutionTarget,
  accountRefFromTarget,
  buildSendPromptOptions,
  legacyGoogleAccountId,
  getProviderCapabilities,
  providerIdForType,
} from './execution-target';
import { resolveChunkingPolicy } from './provider-chunking-policy';
import { shouldSplitChunkOnSoftError } from './provider-retry-policy';

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
    const allowed = new Set<string>(AI_RESPONSE_STATUSES);
    return [...new Set(merged)].filter((s): s is AiResponseStatus => allowed.has(s));
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

  getPrimaryProviderId(): string | null {
    return resolvePrimaryProviderId(this.db, null);
  }

  setPrimaryProviderId(providerId: string | null): void {
    this.db.appMeta.set(
      AI_ROUTING_META_KEYS.primaryProviderId,
      providerId ?? '',
    );
  }

  resolvePrimaryProviderIdForProject(projectId?: string | null): string | null {
    return resolvePrimaryProviderId(this.db, projectId);
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

    const primaryId = resolvePrimaryProviderId(this.db, options?.projectId);
    return reorderProvidersWithPrimary(result, primaryId);
  }

  /**
   * Account-aware selection: only providers that pass preflight.
   * PIN → preferred provider only (no auto-switch).
   * AUTO → READY (else DEGRADED) by priority.
   */
  async selectProvidersForJob(options: {
    projectId: string;
    executionTarget: AiExecutionTarget;
    jobId?: string | null;
    notebookRole?: 'TRANSLATION' | 'RESEARCH' | 'SINGLE';
    /** Phase 5: translate jobs skip Notebook URL requirement. */
    requireNotebook?: boolean;
    pinnedProviderId?: string | null;
    routingMode?: AiRoutingMode;
  }): Promise<{ providers: IAIProvider[]; reports: ProviderPreflightReport[] }> {
    const mode = options.routingMode ?? this.getRoutingMode();
    const pinnedId =
      options.pinnedProviderId ??
      (mode === 'PIN' ? this.getPinnedProviderId() : null);

    const googleId = legacyGoogleAccountId(options.executionTarget) ?? undefined;
    let candidates = this.selectOrderedProviders({
      projectId: options.projectId,
      googleAccountId: googleId,
    });

    // Scheduled target's provider first
    const targetProvider = candidates.find(
      (p) => p.providerId === options.executionTarget.providerId,
    );
    if (targetProvider) {
      candidates = [
        targetProvider,
        ...candidates.filter((p) => p.providerId !== targetProvider.providerId),
      ];
    }

    if (mode === 'PIN' && pinnedId) {
      const pinned = candidates.find((p) => p.providerId === pinnedId);
      candidates = pinned ? [pinned] : [];
    }

    const accountRef = accountRefFromTarget(options.executionTarget);
    const reports: ProviderPreflightReport[] = [];
    for (const provider of candidates) {
      const report = await checkProviderForJob(this.db, {
        executionTarget:
          provider.providerId === options.executionTarget.providerId
            ? options.executionTarget
            : undefined,
        accountRef:
          provider.providerId === options.executionTarget.providerId
            ? accountRef
            : this.accountRefForProvider(provider, options.executionTarget),
        projectId: options.projectId,
        notebookRole: options.notebookRole ?? 'RESEARCH',
        requireNotebook: options.requireNotebook ?? false,
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

  private accountRefForProvider(
    provider: IAIProvider,
    target: AiExecutionTarget,
  ): import('./execution-target').ProviderAccountRef {
    if (provider.providerId === target.providerId) {
      return accountRefFromTarget(target);
    }
    const caps = getProviderCapabilities(provider.providerType);
    if (caps.transport === 'BROWSER' && caps.accountKind === 'GOOGLE_ACCOUNT') {
      const g = legacyGoogleAccountId(target);
      if (g) {
        const profile = this.db.googleAccounts.getProfile(g);
        return {
          accountKind: 'GOOGLE_ACCOUNT',
          accountId: g,
          profileDirName: profile?.profile_dir_name ?? null,
        };
      }
      const worker = this.db.workerStates.listEnabled().find((w) => {
        const acct = this.db.googleAccounts.getById(w.google_account_id);
        return acct?.status === 'READY';
      });
      if (!worker) {
        throw new Error('No READY Google account for Playwright Gemini preflight');
      }
      const profile = this.db.googleAccounts.getProfile(worker.google_account_id);
      return {
        accountKind: 'GOOGLE_ACCOUNT',
        accountId: worker.google_account_id,
        profileDirName: profile?.profile_dir_name ?? null,
      };
    }
    if (provider.providerType === 'GEMINI_WEB_API') {
      if (target.accountKind === 'AI_ACCOUNT' && target.providerType === 'GEMINI_WEB_API') {
        return accountRefFromTarget(target);
      }
      const g = legacyGoogleAccountId(target);
      const linked = g
        ? this.db.aiAccounts.findReadyForGoogleAccount(provider.providerId, g)
        : this.db.aiAccounts.listReadyByProvider(provider.providerId)[0];
      if (!linked) {
        throw new Error('No READY Web API account for preflight');
      }
      return {
        accountKind: 'AI_ACCOUNT',
        accountId: linked.id,
        profileDirName: linked.profile_dir_name,
      };
    }
    if (isBrowserAiAccountProvider(provider.providerType)) {
      const acc = this.db.aiAccounts.pickLeastRecentlyUsedReady(provider.providerId);
      if (!acc) {
        throw new Error(`No READY browser AI account for ${provider.providerId}`);
      }
      return {
        accountKind: 'AI_ACCOUNT',
        accountId: acc.id,
        profileDirName: acc.profile_dir_name,
      };
    }
    throw new Error(`Cannot resolve account ref for provider ${provider.providerId}`);
  }

  async sendWithFallback(
    pack: TranslationPackDto,
    options?: SendPromptOptions & {
      pinnedProviderId?: string | null;
      executionTarget?: AiExecutionTarget;
    },
  ): Promise<AIResponse> {
    await this.initialize();

    let ordered: IAIProvider[];
    if (options?.projectId && options.executionTarget) {
      const selected = await this.selectProvidersForJob({
        projectId: options.projectId,
        executionTarget: options.executionTarget,
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

      if (provider.providerType === 'GEMINI_WEB_API') {
        const linked = options?.googleAccountId
          ? this.db.aiAccounts.findReadyForGoogleAccount(
              provider.providerId,
              options.googleAccountId,
            )
          : this.db.aiAccounts.listReadyByProvider(provider.providerId)[0];
        if (!linked) {
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

      if (isBrowserAiAccountProvider(provider.providerType)) {
        const ready = this.db.aiAccounts.listReadyByProvider(provider.providerId);
        if (ready.length === 0) {
          logger.info('Bỏ qua browser AI provider — chưa có tài khoản READY', {
            providerId: provider.providerId,
            providerType: provider.providerType,
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

      const sendOptions = this.buildSendOptionsForProvider(
        provider,
        options,
        options?.executionTarget,
      );
      if (!sendOptions) {
        logger.info('Bỏ qua provider — không resolve được tài khoản', {
          providerId: provider.providerId,
        });
        continue;
      }

      const packForProvider = this.adaptPackForProvider(pack, provider, sendOptions);

      logger.info('Đang sử dụng AI provider', {
        provider: provider.providerType,
        providerId: provider.providerId,
        event: 'REQUEST_STARTED',
        transport: getProviderCapabilities(provider.providerType).transport,
        packModeHint: options?.packMode ?? 'local_context',
      });

      const response = await provider.sendPrompt(packForProvider, sendOptions);

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
        if (isAiSoftErrorText(response.text, provider.providerType)) {
          const classified = classifyAiResponseText(response.text, provider.providerType);
          const snippet = classified?.snippet ?? 'Provider returned non-translation text';
          logger.warn('AI provider returned soft-error text as SUCCESS', {
            provider: provider.providerType,
            classified: classified?.kind,
            snippet,
          });
          last = {
            ...response,
            status: 'SERVICE_UNAVAILABLE',
            text: '',
            errorCode: 'AI_SOFT_ERROR',
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
      executionTarget: ctx.executionTarget,
      jobId: ctx.job.id,
      notebookRole: 'RESEARCH',
      requireNotebook: false,
      pinnedProviderId:
        (config as { pinnedProviderId?: string }).pinnedProviderId ?? null,
    });
    if (ordered.length === 0) {
      throw new Error(
        'NO_READY_PROVIDER: Không có AI provider READY cho tài khoản/job này (preflight).',
      );
    }
    const batchSize = resolveTranslateBatchParagraphs(ordered[0]?.providerType);
    const chunkPolicy = resolveChunkingPolicy(ordered[0]?.providerType);
    const chunks = chunkPolicy.useBrowserChunking
      ? chunkParagraphBatchForPlaywright(
          paragraphs,
          chunkPolicy.maxParagraphs,
          chunkPolicy.maxSourceChars,
        )
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
      const repairMeta = this.packRepairJobMeta(ctx, config.lockedTerms);
      const telemetry = this.packTelemetryFields(pack, repairMeta);
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
        executionTarget: ctx.executionTarget,
        jobId: ctx.job.id,
        packMode,
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
        lastTelemetry = this.packTelemetryFields(
          pack,
          this.packRepairJobMeta(ctx, config.lockedTerms),
        );
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
          executionTarget: ctx.executionTarget,
          jobId: ctx.job.id,
          requestId: newId(),
          packMode,
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
              response.errorCode === 'AI_SOFT_ERROR' ||
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
        const canSplit = shouldSplitChunkOnSoftError({
          classified:
            lastErrorCode === 'AI_SOFT_ERROR' || lastErrorCode === 'GEMINI_SOFT_ERROR'
              ? 'CONTENT_REJECTED'
              : lastFailStatus === 'SERVICE_UNAVAILABLE'
                ? 'SERVICE_UNAVAILABLE'
                : null,
          paragraphCount: chunk.length,
          sendConfirmation: 'none',
        });
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
        getProviderCapabilities(lastProviderType).transport === 'LOCAL_WORKER'
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
   * Resolve pack mode from project preferNotebookPack (default local_context).
   */
  private resolvePackModeForProject(
    projectId: string,
    accountId?: string | null,
  ): PackMode {
    const prefer = readPreferNotebookPack(this.db.projects.getStyleConfig(projectId));
    return resolveTranslationPackMode(this.db, {
      projectId,
      accountId,
      preferNotebookPack: prefer,
    }).packMode;
  }

  private packContextAccountId(ctx: JobExecuteContext): string | undefined {
    if (ctx.executionTarget.accountKind === 'GOOGLE_ACCOUNT') {
      return ctx.executionTarget.accountId;
    }
    const ai = this.db.aiAccounts.getById(ctx.executionTarget.accountId);
    return ai?.google_account_id ?? undefined;
  }

  private resolvePackMode(ctx: JobExecuteContext, _providerType?: string): PackMode {
    const accountId =
      ctx.executionTarget.accountKind === 'GOOGLE_ACCOUNT'
        ? ctx.executionTarget.accountId
        : legacyGoogleAccountId(ctx.executionTarget) ?? ctx.executionTarget.accountId;
    return this.resolvePackModeForProject(ctx.job.project_id, accountId);
  }

  private buildSendOptionsForProvider(
    provider: IAIProvider,
    base?: SendPromptOptions & { pinnedProviderId?: string | null },
    executionTarget?: AiExecutionTarget,
  ): (SendPromptOptions & { requestId: string }) | null {
    const requestId = base?.requestId ?? newId();

    if (executionTarget && provider.providerId === executionTarget.providerId) {
      return {
        ...buildSendPromptOptions(executionTarget, base),
        requestId,
      };
    }

    const sendCaps = getProviderCapabilities(provider.providerType);

    if (sendCaps.transport === 'LOCAL_WORKER') {
      const googleId =
        executionTarget && executionTarget.accountKind === 'GOOGLE_ACCOUNT'
          ? executionTarget.accountId
          : base?.googleAccountId;
      const linked = googleId
        ? this.db.aiAccounts.findReadyForGoogleAccount(provider.providerId, googleId)
        : executionTarget?.accountKind === 'AI_ACCOUNT' &&
            executionTarget.providerType === 'GEMINI_WEB_API'
          ? this.db.aiAccounts.getById(executionTarget.accountId)
          : null;
      if (!linked || linked.status !== 'READY') return null;
      return {
        ...base,
        requestId,
        aiAccountId: linked.id,
        googleAccountId: googleId ?? linked.google_account_id,
      };
    }

    if (sendCaps.transport === 'BROWSER' && sendCaps.accountKind === 'GOOGLE_ACCOUNT') {
      const googleId =
        executionTarget && executionTarget.accountKind === 'GOOGLE_ACCOUNT'
          ? executionTarget.accountId
          : base?.googleAccountId;
      if (!googleId) return null;
      return { ...base, requestId, googleAccountId: googleId };
    }

    if (isBrowserAiAccountProvider(provider.providerType)) {
      const account =
        executionTarget &&
        executionTarget.accountKind === 'AI_ACCOUNT' &&
        executionTarget.providerId === provider.providerId
          ? this.db.aiAccounts.getById(executionTarget.accountId)
          : this.db.aiAccounts.pickLeastRecentlyUsedReady(provider.providerId);
      if (!account || account.status !== 'READY') return null;
      return {
        ...base,
        requestId,
        aiAccountId: account.id,
        profileDirName: account.profile_dir_name,
        googleAccountId: base?.googleAccountId ?? null,
      };
    }

    return { ...base, requestId };
  }

  private adaptPackForProvider(
    pack: TranslationPackDto,
    _provider: IAIProvider,
    _options?: SendPromptOptions,
  ): TranslationPackDto {
    return pack;
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
    const channel = this.resolveRepairChannel(ctx.job.id, ctx.executionTarget.accountId, {
      providerType: input.providerType ?? null,
      packMode: input.packMode,
    });
    const languagePair = resolveForProjectEdition(this.db, {
      projectId: ctx.job.project_id,
      editionId: ctx.job.edition_id ?? undefined,
    });
    const result = await runContinuationLoop({
      batchParagraphs: chunkParagraphs,
      sourceParagraphIds: input.paragraphIds,
      initialRaw: input.raw,
      sourceLanguage: languagePair.sourceLanguage,
      targetLanguage: languagePair.targetLanguage,
      continuationTargetContext: lastAcceptedTargetParagraphs(
        input.paragraphIds,
        initialParsed.translations,
        2,
      ),
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
            accountId: ctx.executionTarget.accountId,
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
            accountId: ctx.executionTarget.accountId,
            providerType: progress.providerType ?? null,
            packDecision: {
              packMode: progress.packMode,
              notebookId: progress.notebookId ?? null,
              localKnowledgeVersion: progress.localKnowledgeVersion ?? 0,
              notebookVerifiedVersion: progress.notebookVerifiedVersion ?? 0,
              sourceGroundingConfirmed: false,
              reason: progress.packMode ?? 'local_context',
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
          accountId: ctx.executionTarget.accountId,
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
        accountId: ctx.executionTarget.accountId,
      }),
    );
  }

  private packRepairJobMeta(
    ctx: JobExecuteContext,
    lockedTerms?: { source: string; preferred: string; forbiddenVariants?: string[] }[],
  ): {
    projectId: string;
    editionId: string | null;
    sourceLanguage: string;
    targetLanguage: string;
    lockedTerms?: { source: string; preferred: string; forbiddenVariants?: string[] }[];
  } {
    const pair = resolveForProjectEdition(this.db, {
      projectId: ctx.job.project_id,
      editionId: ctx.job.edition_id ?? undefined,
    });
    return {
      projectId: ctx.job.project_id,
      editionId: pair.editionId,
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      lockedTerms,
    };
  }

  private packTelemetryFields(
    pack: TranslationPackBuildResult,
    jobCtx?: {
      projectId: string;
      editionId: string | null;
      sourceLanguage: string;
      targetLanguage: string;
      lockedTerms?: { source: string; preferred: string; forbiddenVariants?: string[] }[];
    },
  ): {
    packMode: PackMode;
    notebookId: string | null;
    localKnowledgeVersion: number;
    notebookVerifiedVersion: number;
    hotDeltaCount: number;
    localContextSnapshot: string;
  } & Record<string, unknown> {
    const base = {
      packMode: pack.packMode,
      notebookId: pack.packTelemetry.notebookId,
      localKnowledgeVersion: pack.packTelemetry.localKnowledgeVersion,
      notebookVerifiedVersion: pack.packTelemetry.notebookVerifiedVersion,
      hotDeltaCount: pack.packTelemetry.hotDeltaCount,
      localContextSnapshot: pack.baseContext,
    };
    if (!jobCtx) return base;
    return {
      ...base,
      ...repairContextSnapshot(
        buildRepairTranslationContext({
          projectId: jobCtx.projectId,
          editionId: jobCtx.editionId,
          sourceLanguage: jobCtx.sourceLanguage,
          targetLanguage: jobCtx.targetLanguage,
          stylePolicyHash: pack.promptHash,
          knowledgeVersion: pack.packTelemetry.localKnowledgeVersion,
          lockedTerms: jobCtx.lockedTerms ?? [],
        }),
      ),
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
    const startVersion = resolveJobKnowledgeSnapshot(
      this.db,
      ctx.job.id,
      ctx.job.project_id,
    );
    this.db.jobs.setKnowledgeVersionAtStart(ctx.job.id, startVersion);

    const diagnostics = buildTranslationContextDiagnostics(this.db, {
      projectId: ctx.job.project_id,
      accountId: ctx.executionTarget.accountId,
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

    const packCaps = getProviderCapabilities(providerType);
    if (
      diagnostics.notebookId &&
      packCaps.supportsNotebookAssisted &&
      pack.packMode === 'notebook_assisted'
    ) {
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
      ...this.packTelemetryFields(
        pack,
        this.packRepairJobMeta(ctx, parseJobConfig(ctx.job.config).lockedTerms),
      ),
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
   * Shared send path for repair + continuation: same local context snapshot for every provider.
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
    const preferredType = (input.channel.providerType ??
      'GEMINI_WEB_API') as AiProviderType;
    const preferredCaps = getProviderCapabilities(preferredType);
    const preferredProviderId = providerIdForType(preferredType);
    const operationType = input.operationType ?? 'REPAIR';

    const repairPack = this.buildChannelRepairPack({
      projectId: input.projectId,
      jobId: input.jobId,
      repairBody: input.repairBody,
      channel: input.channel,
      targetParagraphIds: input.targetParagraphIds,
      operationType,
    });

    const repairPackMode = this.resolvePackModeForProject(
      input.projectId,
      input.accountId,
    );

    const sendOnce = async (providerId: string, requestId: string) =>
      this.sendWithFallback(repairPack, {
        projectId: input.projectId,
        googleAccountId: input.accountId,
        jobId: input.jobId,
        requestId,
        packMode: repairPackMode,
        pinnedProviderId: providerId,
        preserveRepairPrompt: true,
        notebookId: input.channel.notebookId,
        threadRef: input.channel.threadRef,
      });

    const firstResponse = await sendOnce(
      preferredProviderId,
      input.requestId ?? newId(),
    );

    if (firstResponse.status === 'SUCCESS' && firstResponse.text.trim()) {
      const used: RepairChannelContext = {
        ...input.channel,
        providerType: preferredType,
        accountId: input.accountId,
        packMode: input.channel.packMode ?? 'local_context',
        localContextSnapshot:
          input.channel.localContextSnapshot ?? repairPack.baseContext,
      };
      this.persistChannelOnJobProgress(input.jobId, used);
      return {
        rawResponse: firstResponse.text,
        inputRef: `corr:${firstResponse.requestId}`,
        channel: used,
      };
    }

    const soft =
      firstResponse.errorCode === 'AI_SOFT_ERROR' ||
      firstResponse.errorCode === 'GEMINI_SOFT_ERROR' ||
      isAiSoftErrorText(firstResponse.errorMessage, preferredType) ||
      /something went wrong|hard time fulfilling/i.test(firstResponse.errorMessage ?? '');
    if (soft && preferredCaps.transport === 'BROWSER') {
      await new Promise((r) => setTimeout(r, 5_000));
      const retry = await sendOnce(preferredProviderId, newId());
      if (retry.status === 'SUCCESS' && retry.text.trim()) {
        const used: RepairChannelContext = {
          ...input.channel,
          providerType: preferredType,
          accountId: input.accountId,
          localContextSnapshot:
            input.channel.localContextSnapshot ?? repairPack.baseContext,
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
        firstResponse.errorMessage ?? userMessageForStatus(firstResponse.status),
      );
    }

    if (preferredProviderId !== AI_PROVIDER_IDS.GEMINI_WEB_API) {
      logger.info('Repair failover → Web API (same local context pack)', {
        jobId: input.jobId,
        from: preferredType,
        status: firstResponse.status,
        operationType,
      });
    }

    const webResponse = await sendOnce(
      AI_PROVIDER_IDS.GEMINI_WEB_API,
      input.requestId ?? newId(),
    );
    if (webResponse.status !== 'SUCCESS' || !webResponse.text.trim()) {
      throw new Error(
        webResponse.errorMessage ?? userMessageForStatus(webResponse.status),
      );
    }
    const used: RepairChannelContext = {
      ...input.channel,
      providerType: 'GEMINI_WEB_API',
      accountId: input.accountId,
      packMode: input.channel.packMode ?? 'local_context',
      localContextSnapshot:
        input.channel.localContextSnapshot ?? repairPack.baseContext,
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
    const primaryType = this.listRegistered().find(
      (p) => p.providerId === resolvePrimaryProviderId(this.db, job?.project_id),
    )?.providerType;
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
        primaryType ??
        'GEMINI_WEB_API',
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
      packMode: override?.packMode ?? fromProgress.packMode ?? 'local_context',
      knowledgeVersion:
        override?.knowledgeVersion ??
        fromProgress.knowledgeVersion ??
        mapping?.knowledge_version ??
        null,
      localContextSnapshot:
        override?.localContextSnapshot ??
        fromProgress.localContextSnapshot ??
        null,
      sourceLanguage: override?.sourceLanguage ?? fromProgress.sourceLanguage ?? null,
      targetLanguage: override?.targetLanguage ?? fromProgress.targetLanguage ?? null,
      editionId: override?.editionId ?? fromProgress.editionId ?? job?.edition_id ?? null,
      stylePolicyHash:
        override?.stylePolicyHash ?? fromProgress.stylePolicyHash ?? null,
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

  private buildChannelRepairPack(input: {
    projectId: string;
    jobId: string;
    repairBody: string;
    channel: RepairChannelContext;
    targetParagraphIds?: string[];
    operationType?: TranslationPackOperation;
  }): TranslationPackDto {
    const job = this.db.jobs.getById(input.jobId);
    const chapterIds = this.resolveJobChapterIds(input.projectId, job);
    const operationType = input.operationType ?? 'REPAIR';

    let localContextSnapshot = input.channel.localContextSnapshot?.trim() ?? '';
    if (!localContextSnapshot && chapterIds.length > 0) {
      try {
        const fresh = getTranslationPackService().build({
          projectId: input.projectId,
          chapterIds,
          paragraphIds: input.targetParagraphIds,
          googleAccountId: input.channel.accountId ?? undefined,
          packMode: input.channel.packMode ?? 'local_context',
          jobId: input.jobId,
        });
        localContextSnapshot = fresh.baseContext;
      } catch (error) {
        logger.warn('Local context rebuild for repair failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const split = splitRepairChannelPrompt({
      repairBody: input.repairBody,
      operationType,
      localContextSnapshot,
    });

    const base =
      chapterIds.length > 0
        ? this.buildMinimalPack(
            input.projectId,
            split,
            operationType,
            job ?? { chapter_from: null, chapter_to: null },
            input.channel.stylePolicyHash,
            input.targetParagraphIds?.length ?? 0,
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
        paragraphCount: input.targetParagraphIds?.length ?? 0,
        chapterCount: 1,
      },
      promptHash:
        input.channel.stylePolicyHash ?? `repair:${newId().slice(0, 12)}`,
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
    packMode: PackMode = 'local_context',
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
      googleAccountId: this.packContextAccountId(ctx),
      providerType,
      packMode,
      jobId: ctx.job.id,
      editionId: ctx.job.edition_id ?? undefined,
    });
  }

  private buildMinimalPack(
    projectId: string,
    split: { baseContext: string; operationPrompt: string; prompt: string },
    operationType: TranslationPackOperation,
    job: { chapter_from: number | null; chapter_to: number | null },
    stylePolicyHash?: string | null,
    targetParagraphCount = 0,
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
        paragraphCount: targetParagraphCount,
        chapterCount: Math.max(1, chapterIds.length),
      },
      promptHash: stylePolicyHash ?? `repair:${newId().slice(0, 12)}`,
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
    case 'PLAYWRIGHT_CHATGPT':
      return 'ChatGPT Browser';
    case 'PLAYWRIGHT_META_AI':
      return 'Meta AI Browser';
    case 'GEMINI_OFFICIAL':
      return 'Gemini Official API';
    default:
      return type;
  }
}

export { AI_PROVIDER_IDS };
