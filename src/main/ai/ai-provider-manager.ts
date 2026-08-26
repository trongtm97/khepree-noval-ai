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
import type { IAIProvider } from './iai-provider';
import type { AIResponse, SendPromptOptions } from './types';
import { isGeminiSoftErrorText, geminiSoftErrorSnippet } from '@shared/utils/gemini-soft-error';
import { userMessageForStatus } from './error-map';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';
import type { JobExecuteContext, InitialSendResult } from '../jobs/batch-executor';
import type { RepairSendRequest, RepairSendResult } from '../jobs/repair-loop';
import { getTranslationPackService } from '../services/translation-pack-service-singleton';
import { parseJobConfig } from '../jobs/batch-executor';
import type { TranslationPackDto as Pack } from '@shared/schemas/translation-pack';
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
    return [
      ...new Set([
        ...parsed,
        ...AUTH_FALLBACK_STATUSES,
        'ERROR' as AiResponseStatus,
        'SERVICE_UNAVAILABLE' as AiResponseStatus,
        'NETWORK_ERROR' as AiResponseStatus,
        'TIMEOUT' as AiResponseStatus,
      ]),
    ];
  }

  setFallbackConfig(enabled: boolean, statuses?: AiResponseStatus[]): void {
    this.db.appMeta.set(AI_FALLBACK_META_KEYS.enabled, enabled ? '1' : '0');
    if (statuses) {
      this.db.appMeta.set(AI_FALLBACK_META_KEYS.onStatuses, JSON.stringify(statuses));
    }
  }

  /**
   * Ordered enabled providers — **DB priority first** (lower number = tried first).
   * Soft rules only:
   * - Playwright needs a usable notebook mapping; if missing, demote Playwright
   *   so Web API can run instead of hard-failing "Notebook mapping not ready".
   * Does **not** ignore user priority when Web API has a READY account.
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
      const mapping = this.db.notebooks.getByProjectAndWorker(
        options.projectId,
        options.googleAccountId,
      );
      return Boolean(
        mapping &&
          (mapping.status === 'ready' || mapping.status === 'sync_pending'),
      );
    })();

    if (!notebookOk) {
      // Playwright cannot succeed without notebook — keep it as fallback only.
      result.sort((a, b) => {
        const score = (p: IAIProvider): number =>
          p.providerType === 'PLAYWRIGHT_GEMINI' ? 1 : 0;
        return score(a) - score(b);
      });
    }

    return result;
  }

  async sendWithFallback(
    pack: TranslationPackDto,
    options?: SendPromptOptions,
  ): Promise<AIResponse> {
    await this.initialize();
    const ordered = this.selectOrderedProviders({
      projectId: options?.projectId,
      googleAccountId: options?.googleAccountId ?? undefined,
    });
    if (ordered.length === 0) {
      return {
        requestId: options?.requestId ?? newId(),
        status: 'ERROR',
        text: '',
        errorCode: 'NO_PROVIDER',
        errorMessage: 'Không có nhà cung cấp AI nào được bật.',
      };
    }

    const fallbackOn = this.isFallbackEnabled();
    const fallbackStatuses = new Set(this.getFallbackStatuses());
    let last: AIResponse | null = null;

    for (let i = 0; i < ordered.length; i += 1) {
      const provider = ordered[i]!;
      const row = this.db.aiProviders.getById(provider.providerId);

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

      logger.info('Đang sử dụng AI provider', {
        provider: provider.providerType,
        providerId: provider.providerId,
        event: 'REQUEST_STARTED',
      });

      const response = await provider.sendPrompt(pack, {
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
    const ordered = this.selectOrderedProviders({
      projectId: ctx.job.project_id,
      googleAccountId: ctx.accountId,
    });
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

    const packMode = this.resolvePackMode(ctx);

    if (chunks.length <= 1) {
      const pack = this.buildPackForJob(ctx, config.sourceParagraphIds);
      this.db.jobs.updateState(ctx.job.id, 'SENDING');
      this.writeSendProgress(ctx, {
        phase: 'sending',
        chunkIndex: 1,
        chunkTotal: 1,
        paragraphsDone: 0,
        paragraphsTotal: totalParas,
        packMode,
      });
      this.db.jobs.updateState(ctx.job.id, 'WAITING_AI');
      this.writeSendProgress(ctx, {
        phase: 'waiting_ai',
        chunkIndex: 1,
        chunkTotal: 1,
        paragraphsDone: 0,
        paragraphsTotal: totalParas,
        packMode,
      });
      const response = await this.sendWithFallback(pack, {
        projectId: ctx.job.project_id,
        googleAccountId: ctx.accountId,
        jobId: ctx.job.id,
      });
      if (response.status !== 'SUCCESS') {
        const msg =
          response.errorMessage ??
          userMessageForStatus(response.status) ??
          response.status;
        throw new Error(`${response.status}: ${msg}`);
      }
      this.writeSendProgress(ctx, {
        phase: 'waiting_ai',
        chunkIndex: 1,
        chunkTotal: 1,
        paragraphsDone: totalParas,
        paragraphsTotal: totalParas,
        packMode,
        providerType: response.providerType,
      });
      return {
        rawResponse: response.text,
        inputRef: `corr:${response.requestId}`,
      };
    }

    const parser = new ResponseParser();
    const merged: TranslationLine[] = [];
    const mergedTermDeltas: TermDeltaItem[][] = [];
    const mergedMemoryDeltas: MemoryDeltaItem[][] = [];
    const requestIds: string[] = [];
    let lastProviderType: string | undefined;

    // Work queue so soft-error chunks can be split and re-queued.
    type Para = (typeof paragraphs)[number];
    const queue: Para[][] = chunks.map((c) => [...c]);
    let sendOrdinal = 0;
    /** Upper bound for progress UI (grows when we split). */
    let progressTotal = Math.max(1, chunks.length);

    while (queue.length > 0) {
      const chunk = queue.shift()!;
      sendOrdinal += 1;
      const paragraphIds = chunk.map((p) => p.paragraphId);
      this.writeSendProgress(ctx, {
        phase: 'sending',
        chunkIndex: sendOrdinal,
        chunkTotal: progressTotal,
        paragraphsDone: merged.length,
        paragraphsTotal: totalParas,
        packMode,
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
          packMode,
          providerType: lastProviderType,
        });

        const pack = this.buildPackForJob(ctx, paragraphIds);
        this.db.jobs.updateState(ctx.job.id, 'WAITING_AI');
        this.writeSendProgress(ctx, {
          phase: 'waiting_ai',
          chunkIndex: sendOrdinal,
          chunkTotal: progressTotal,
          paragraphsDone: merged.length,
          paragraphsTotal: totalParas,
          packMode,
          providerType: lastProviderType,
        });

        const response = await this.sendWithFallback(pack, {
          projectId: ctx.job.project_id,
          googleAccountId: ctx.accountId,
          jobId: ctx.job.id,
          requestId: newId(),
        });

        if (response.status !== 'SUCCESS') {
          lastFailStatus = response.status;
          lastFailMsg =
            response.errorMessage ??
            userMessageForStatus(response.status) ??
            response.status;
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
          chunkLines = parsed.translations;
          chunkTermDeltas = parsed.termDeltas;
          chunkMemoryDeltas = parsed.memoryDeltas;
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
            TRANSIENT_CHUNK_STATUSES.has(lastFailStatus as AiResponseStatus) ||
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
        packMode,
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
      packMode,
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
   * Slim = Notebook cold sources trusted (ready / sync_pending).
   * Anything else (stale, syncing, assisted, missing) → fat so mid-batch
   * multi-chapter jobs use live SQLite memory after each PASS.
   */
  private resolvePackMode(ctx: JobExecuteContext): 'slim' | 'fat' {
    const mapping = this.db.notebooks.getByProjectAndWorker(
      ctx.job.project_id,
      ctx.accountId,
    );
    const notebookOk =
      mapping &&
      (mapping.status === 'ready' || mapping.status === 'sync_pending');
    return notebookOk ? 'slim' : 'fat';
  }

  private writeSendProgress(
    ctx: JobExecuteContext,
    progress: {
      phase: string;
      chunkIndex: number;
      chunkTotal: number;
      paragraphsDone: number;
      paragraphsTotal: number;
      packMode?: 'slim' | 'fat';
      providerType?: string;
    },
  ): void {
    this.db.jobs.updateProgress(
      ctx.job.id,
      JSON.stringify({
        ...progress,
        accountId: ctx.accountId,
      }),
    );
  }

  async sendRepair(request: RepairSendRequest): Promise<RepairSendResult> {
    const job = this.db.jobs.getById(request.jobId);
    if (!job) throw new Error(`Job not found: ${request.jobId}`);

    const prompt = request.plan?.prompt ?? request.initialPrompt ?? '';
    if (!prompt) throw new Error('Repair send missing prompt');

    const pack = this.buildMinimalPack(job.project_id, prompt, job);
    const accountId =
      job.pinned_account_id ??
      this.resolveAccountFromProgress(job.id) ??
      undefined;

    const response = await this.sendWithFallback(pack, {
      projectId: job.project_id,
      googleAccountId: accountId,
      jobId: job.id,
      requestId: newId(),
    });

    if (response.status !== 'SUCCESS') {
      const soft =
        response.errorCode === 'GEMINI_SOFT_ERROR' ||
        isGeminiSoftErrorText(response.errorMessage) ||
        /something went wrong|hard time fulfilling/i.test(
          response.errorMessage ?? '',
        );
      if (soft) {
        // One cooldown retry — repair prompts often trip Gemini soft errors.
        await new Promise((r) => setTimeout(r, 5_000));
        const retry = await this.sendWithFallback(pack, {
          projectId: job.project_id,
          googleAccountId: accountId,
          jobId: job.id,
          requestId: newId(),
        });
        if (retry.status === 'SUCCESS' && retry.text.trim()) {
          return {
            rawResponse: retry.text,
            inputRef: `corr:${retry.requestId}`,
          };
        }
      }
      throw new Error(
        response.errorMessage ?? userMessageForStatus(response.status),
      );
    }

    return {
      rawResponse: response.text,
      inputRef: `corr:${response.requestId}`,
    };
  }

  private resolveAccountFromProgress(jobId: string): string | null {
    const job = this.db.jobs.getById(jobId);
    if (!job?.progress) return null;
    try {
      const parsed = JSON.parse(job.progress) as { accountId?: string };
      return parsed.accountId ?? null;
    } catch {
      return null;
    }
  }

  private buildPackForJob(
    ctx: JobExecuteContext,
    paragraphIds?: string[],
  ): Pack {
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
      const para = this.db.paragraphs.getById(ids[0]!);
      if (para) chapterIds = [para.chapter_id];
    }

    if (chapterIds.length === 0) {
      throw new Error('Cannot build TranslationPack: no chapterIds for job');
    }

    const limited = chapterIds.slice(0, 3);
    const mapping = this.db.notebooks.getByProjectAndWorker(
      ctx.job.project_id,
      ctx.accountId,
    );
    const notebookOk =
      mapping &&
      (mapping.status === 'ready' || mapping.status === 'sync_pending');

    return getTranslationPackService().build({
      projectId: ctx.job.project_id,
      chapterIds: limited,
      paragraphIds: ids.length > 0 ? ids : undefined,
      googleAccountId: ctx.accountId,
      packMode: notebookOk ? 'slim' : 'fat',
      forceFatPack: !notebookOk,
    });
  }

  private buildMinimalPack(
    projectId: string,
    prompt: string,
    job: { chapter_from: number | null; chapter_to: number | null },
  ): TranslationPackDto {
    const chapters = this.db.chapters.listByProject(projectId);
    let chapterIds: string[] = [];
    if (job.chapter_from != null && job.chapter_to != null) {
      chapterIds = chapters
        .filter((c) => {
          const n = c.chapter_number ?? c.sequence_order;
          return n >= job.chapter_from! && n <= job.chapter_to!;
        })
        .map((c) => c.id)
        .slice(0, 3);
    }
    if (chapterIds.length === 0 && chapters[0]) {
      chapterIds = [chapters[0].id];
    }

    if (chapterIds.length > 0) {
      try {
        const pack = getTranslationPackService().build({
          projectId,
          chapterIds,
        });
        return { ...pack, prompt };
      } catch {
        // fall through to synthetic
      }
    }

    return {
      projectId,
      chapterIds: chapterIds.length ? chapterIds : [newId()],
      chapterNumbers: [],
      style: 'balanced',
      prompt,
      sections: {
        taskHeader: '',
        criticalRules: '',
        hotMemoryDelta: '',
        activeProjectTerms: '',
        sourceParagraphs: '',
        outputProtocol: '',
      },
      size: {
        sourceChars: prompt.length,
        contextChars: 0,
        totalChars: prompt.length,
        estimatedTokens: Math.ceil(prompt.length / 4),
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
