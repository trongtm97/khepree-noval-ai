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

/**
 * Adapts existing GeminiService / Playwright path to IAIProvider.
 * Does not change browser automation internals.
 */
export class PlaywrightGeminiAdapter implements IAIProvider {
  readonly providerId = AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI;
  readonly providerType = 'PLAYWRIGHT_GEMINI' as const;

  private readonly active = new Map<string, AbortController>();

  constructor(private readonly geminiService: GeminiService) {}

  async initialize(): Promise<void> {
    await Promise.resolve();
  }

  async healthCheck(): Promise<AIProviderHealth> {
    await Promise.resolve();
    return {
      ok: true,
      status: 'READY',
      message: 'Gemini Browser provider available (Playwright)',
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

    const controller = new AbortController();
    this.active.set(requestId, controller);

    try {
      const sent = await this.geminiService.sendTranslation({
        projectId,
        accountId: googleAccountId,
        pack,
        jobId: options?.jobId ?? null,
        headless: options?.headless,
        maxTimeoutMs: options?.maxTimeoutMs,
      });

      if (sent.status === 'completed') {
        return {
          requestId: sent.correlationId || requestId,
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
        requestId: sent.correlationId || requestId,
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
      this.active.delete(requestId);
    }
  }

  async cancelRequest(requestId: string): Promise<void> {
    this.active.get(requestId)?.abort();
    this.active.delete(requestId);
    await Promise.resolve();
  }

  async getStatus(): Promise<AIProviderStatusSnapshot> {
    await Promise.resolve();
    return {
      providerId: this.providerId,
      type: this.providerType,
      ready: true,
      message: 'Playwright Gemini adapter ready',
    };
  }

  async close(): Promise<void> {
    this.active.clear();
    await Promise.resolve();
  }
}
