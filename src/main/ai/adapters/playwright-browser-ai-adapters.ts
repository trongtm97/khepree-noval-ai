import {
  AI_PROVIDER_IDS,
  type AiProviderType,
} from '@shared/constants/ai-provider';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { PlaywrightBrowserAiService } from '../../services/playwright-browser-ai-service';
import type { IAIProvider } from '../iai-provider';
import type {
  AIProviderHealth,
  AIProviderStatusSnapshot,
  AIResponse,
  SendPromptOptions,
} from '../types';
import { mapTechnicalErrorToStatus, userMessageForStatus } from '../error-map';
import { newId } from '../../db/utils/uuid';
import { getDatabase } from '../../db/connection';
import { browserProfileManager } from '../../automation/browser-runner/profile-manager';
import { assessBrowserDependencyHealth } from '../../automation/browser-runner/browser-dependency-health';

export abstract class PlaywrightBrowserAiAdapterBase implements IAIProvider {
  abstract readonly providerId: string;
  abstract readonly providerType: Extract<
    AiProviderType,
    'PLAYWRIGHT_CHATGPT' | 'PLAYWRIGHT_META_AI'
  >;

  private readonly activeIds = new Map<string, string>();

  constructor(protected readonly browserAi: PlaywrightBrowserAiService) {}

  async initialize(): Promise<void> {
    await Promise.resolve();
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const db = getDatabase();
    const ready = db.aiAccounts.listReadyByProvider(this.providerId);
    if (ready.length === 0) {
      const any = db.aiAccounts.listByProvider(this.providerId);
      const login = any.find((a) => a.status === 'LOGIN_REQUIRED');
      return {
        ok: false,
        status: 'LOGIN_REQUIRED',
        message: login
          ? `${this.providerLabel()} cần đăng nhập lại.`
          : `Chưa có tài khoản ${this.providerLabel()} sẵn sàng.`,
        accountEmail: login?.display_name ?? login?.google_email ?? null,
      };
    }

    const browserHealth = assessBrowserDependencyHealth('AUTO');
    if (!browserHealth.browserUsable) {
      return {
        ok: false,
        status: 'ERROR',
        message: browserHealth.message,
      };
    }

    const sample = ready[0];
    if (sample.profile_dir_name && !browserProfileManager.profileExists(sample.profile_dir_name)) {
      return {
        ok: false,
        status: 'ERROR',
        message: 'Thư mục browser profile không tồn tại.',
        accountEmail: sample.display_name,
      };
    }

    return {
      ok: true,
      status: 'READY',
      message: `${this.providerLabel()} sẵn sàng.`,
      accountEmail: sample.display_name ?? sample.google_email,
      lastUsedAt: sample.last_used_at,
    };
  }

  async sendPrompt(
    pack: TranslationPackDto,
    options?: SendPromptOptions,
  ): Promise<AIResponse> {
    const requestId = options?.requestId ?? newId();
    const aiAccountId = options?.aiAccountId;
    if (!aiAccountId) {
      return {
        requestId,
        status: 'ERROR',
        text: '',
        errorCode: 'MISSING_ACCOUNT',
        errorMessage: `${this.providerLabel()} requires aiAccountId`,
        providerType: this.providerType,
        providerId: this.providerId,
      };
    }

    const correlationId = requestId;
    this.activeIds.set(requestId, correlationId);

    try {
      const sent = await this.browserAi.sendTranslation({
        providerType: this.providerType,
        aiAccountId,
        pack,
        jobId: options?.jobId ?? null,
        headless: options?.headless,
        maxTimeoutMs: options?.maxTimeoutMs,
        correlationId,
      });

      if (sent.status === 'completed') {
        return {
          requestId: sent.correlationId,
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
        requestId: sent.correlationId,
        status,
        text: '',
        errorCode: sent.errorCode ?? status,
        errorMessage:
          sent.errorMessage ?? userMessageForStatus(status) ?? 'Yêu cầu AI thất bại.',
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

  async cancelRequest(requestId: string): Promise<void> {
    const correlationId = this.activeIds.get(requestId) ?? requestId;
    await this.browserAi.cancelActive(correlationId);
    this.activeIds.delete(requestId);
  }

  async getStatus(): Promise<AIProviderStatusSnapshot> {
    const health = await this.healthCheck();
    return {
      providerId: this.providerId,
      type: this.providerType,
      ready: health.ok,
      message: health.message,
    };
  }

  async close(): Promise<void> {
    this.activeIds.clear();
    await this.browserAi.close().catch(() => undefined);
  }

  protected abstract providerLabel(): string;
}

export class PlaywrightChatGptAdapter extends PlaywrightBrowserAiAdapterBase {
  readonly providerId = AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT;
  readonly providerType = 'PLAYWRIGHT_CHATGPT' as const;

  protected providerLabel(): string {
    return 'ChatGPT Browser';
  }
}

export class PlaywrightMetaAiAdapter extends PlaywrightBrowserAiAdapterBase {
  readonly providerId = AI_PROVIDER_IDS.PLAYWRIGHT_META_AI;
  readonly providerType = 'PLAYWRIGHT_META_AI' as const;

  protected providerLabel(): string {
    return 'Meta AI Browser';
  }
}
