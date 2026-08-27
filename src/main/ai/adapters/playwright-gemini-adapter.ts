import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { GeminiService } from '../../services/gemini-service';
import type { IAIProvider } from '../iai-provider';
import type {
  AIProviderHealth,
  AIProviderStatusSnapshot,
  AIResponse,
  SendPromptOptions,
} from '../types';
import { mapTechnicalErrorToStatus, userMessageForStatus } from '../error-map';
import { newId } from '../../db/utils/uuid';
import { checkProviderForJob } from '../provider-preflight';
import { getDatabase } from '../../db/connection';

/**
 * Adapts existing GeminiService / Playwright path to IAIProvider.
 */
export class PlaywrightGeminiAdapter implements IAIProvider {
  readonly providerId = AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI;
  readonly providerType = 'PLAYWRIGHT_GEMINI' as const;

  /** requestId / correlationId → cancel target */
  private readonly activeIds = new Map<string, string>();

  constructor(private readonly geminiService: GeminiService) {}

  async initialize(): Promise<void> {
    await Promise.resolve();
  }

  async healthCheck(): Promise<AIProviderHealth> {
    // Object existence ≠ READY. Require a real account-aware signal when possible.
    return {
      ok: false,
      status: 'ERROR',
      message:
        'Gọi checkProviderForJob(accountId, projectId) — healthCheck generic không đủ để chọn Playwright.',
    };
  }

  async sendPrompt(
    pack: TranslationPackDto,
    options?: SendPromptOptions,
  ): Promise<AIResponse> {
    const requestId = options?.requestId ?? newId();
    const googleAccountId = options?.googleAccountId;
    const projectId = options?.projectId ?? pack.projectId;

    if (!googleAccountId) {
      return {
        requestId,
        status: 'ERROR',
        text: '',
        errorCode: 'MISSING_ACCOUNT',
        errorMessage: 'Playwright Gemini requires googleAccountId',
        providerType: this.providerType,
        providerId: this.providerId,
      };
    }

    if (projectId) {
      const preflight = await checkProviderForJob(getDatabase(), {
        accountId: googleAccountId,
        projectId,
        notebookRole: 'TRANSLATION',
        providerId: this.providerId,
        jobId: options?.jobId ?? null,
        lightweight: true,
      });
      if (preflight.result === 'NEEDS_LOGIN') {
        return {
          requestId,
          status: 'LOGIN_REQUIRED',
          text: '',
          errorCode: preflight.result,
          errorMessage: preflight.message,
          providerType: this.providerType,
          providerId: this.providerId,
        };
      }
      if (preflight.result === 'QUOTA_LIMIT') {
        return {
          requestId,
          status: 'RATE_LIMIT',
          text: '',
          errorCode: preflight.result,
          errorMessage: preflight.message,
          providerType: this.providerType,
          providerId: this.providerId,
        };
      }
      if (
        preflight.result === 'PROFILE_BUSY' ||
        preflight.result === 'NOTEBOOK_ERROR' ||
        preflight.result === 'UNAVAILABLE'
      ) {
        return {
          requestId,
          status: 'ERROR',
          text: '',
          errorCode: preflight.result,
          errorMessage: preflight.message,
          providerType: this.providerType,
          providerId: this.providerId,
        };
      }
    }

    this.activeIds.set(requestId, requestId);

    try {
      const sent = await this.geminiService.sendTranslation({
        projectId,
        accountId: googleAccountId,
        pack,
        jobId: options?.jobId ?? null,
        headless: options?.headless,
        maxTimeoutMs: options?.maxTimeoutMs,
      });

      const corr = sent.correlationId || requestId;
      this.activeIds.set(requestId, corr);
      this.activeIds.set(corr, corr);

      if (sent.status === 'completed') {
        return {
          requestId: corr,
          status: 'SUCCESS',
          text: sent.rawResponse,
          providerType: this.providerType,
          providerId: this.providerId,
        };
      }

      const status = mapTechnicalErrorToStatus(
        sent.errorCode ?? sent.errorMessage ?? 'ERROR',
      );
      return {
        requestId: corr,
        status,
        text: '',
        errorCode: sent.errorCode ?? status,
        errorMessage:
          sent.errorMessage || userMessageForStatus(status) || 'Yêu cầu AI thất bại.',
        providerType: this.providerType,
        providerId: this.providerId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = mapTechnicalErrorToStatus(message);
      return {
        requestId,
        status,
        text: '',
        errorCode: status,
        errorMessage: message || userMessageForStatus(status),
        providerType: this.providerType,
        providerId: this.providerId,
      };
    } finally {
      this.activeIds.delete(requestId);
    }
  }

  /**
   * Real cancel: stop Playwright generation (Stop button / cancelled flag),
   * not an unused AbortController.
   */
  async cancelRequest(requestId: string): Promise<void> {
    const correlationId = this.activeIds.get(requestId) ?? requestId;
    await this.geminiService.cancelActive(correlationId);
    this.activeIds.delete(requestId);
    this.activeIds.delete(correlationId);
  }

  async getStatus(): Promise<AIProviderStatusSnapshot> {
    await Promise.resolve();
    return {
      providerId: this.providerId,
      type: this.providerType,
      ready: false,
      message: 'Cần checkProviderForJob theo account/project — không READY mặc định.',
    };
  }

  async close(): Promise<void> {
    this.activeIds.clear();
    await this.geminiService.cancelActive().catch(() => undefined);
  }
}
