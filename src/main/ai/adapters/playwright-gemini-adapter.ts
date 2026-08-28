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

  /** requestId → correlationId (set before send so mid-flight cancel works). */
  private readonly activeIds = new Map<string, string>();

  constructor(private readonly geminiService: GeminiService) {}

  async initialize(): Promise<void> {
    await Promise.resolve();
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const db = getDatabase();
    const accounts = db.googleAccounts.list().filter((a) => {
      const s = a.status.toUpperCase();
      return s !== 'DISABLED';
    });
    if (accounts.length === 0) {
      return {
        ok: false,
        status: 'LOGIN_REQUIRED',
        message: 'Chưa có tài khoản Google cho Gemini Browser.',
      };
    }

    const usable = accounts.find((a) => {
      const s = a.status.toUpperCase();
      return s === 'READY' || s === 'BUSY';
    });
    if (!usable) {
      const login = accounts.find((a) => {
        const s = a.status.toUpperCase();
        return s === 'LOGIN_REQUIRED' || s === 'NEEDS_ATTENTION';
      });
      return {
        ok: false,
        status: 'LOGIN_REQUIRED',
        message: login
          ? 'Google session cần đăng nhập lại trước khi dùng Gemini Browser.'
          : 'Không có tài khoản Google sẵn sàng cho Gemini Browser.',
        accountEmail: (login ?? accounts[0]).email ?? null,
      };
    }

    const profile = db.googleAccounts.getProfile(usable.id);
    if (!profile?.profile_dir_name) {
      return {
        ok: false,
        status: 'ERROR',
        message: 'Browser profile chưa có — mở Tài khoản và đăng nhập Gemini.',
        accountEmail: usable.email,
      };
    }

    const { browserProfileManager } = await import(
      '../../automation/browser-runner/profile-manager'
    );
    const { profileLockManager } = await import(
      '../../automation/browser-runner/profile-lock'
    );
    const { assessBrowserDependencyHealth } = await import(
      '../../automation/browser-runner/browser-dependency-health'
    );

    if (!browserProfileManager.profileExists(profile.profile_dir_name)) {
      return {
        ok: false,
        status: 'ERROR',
        message: 'Thư mục profile browser không tồn tại.',
        accountEmail: usable.email,
      };
    }

    const browserHealth = assessBrowserDependencyHealth('AUTO');
    if (!browserHealth.browserUsable) {
      return {
        ok: false,
        status: 'ERROR',
        message: browserHealth.message,
        accountEmail: usable.email,
      };
    }

    const profilePath = browserProfileManager.resolveProfilePath(profile.profile_dir_name);
    profileLockManager.recoverIfStale(profilePath);
    if (profileLockManager.isLocked(profilePath)) {
      const owner = profileLockManager.getOwner(profilePath);
      // Manual Accounts browser for this account — close so health can pass.
      if (owner === usable.id) {
        try {
          const { getAccountWorkerService } = await import(
            '../../services/account-worker-singleton'
          );
          await getAccountWorkerService().closeBrowser(usable.id);
          profileLockManager.recoverIfStale(profilePath);
        } catch {
          // fall through
        }
      }
      if (profileLockManager.isLocked(profilePath)) {
        return {
          ok: false,
          status: 'ERROR',
          message: `Profile đang bị giữ (${owner ?? 'unknown'}). Đóng trình duyệt Accounts/Notebook rồi kiểm tra lại.`,
          accountEmail: usable.email,
        };
      }
    }

    return {
      ok: true,
      status: 'READY',
      message:
        'Gemini Browser sẵn sàng (khi dịch vẫn cần Notebook mapping READY cho dự án).',
      accountEmail: usable.email,
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
        notebookRole: 'RESEARCH',
        requireNotebook: false,
        providerId: this.providerId,
        jobId: options.jobId ?? null,
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

    // Same id for request + correlation so cancelRequest mid-flight hits GeminiService.
    const correlationId = requestId;
    this.activeIds.set(requestId, correlationId);

    try {
      const sent = await this.geminiService.sendTranslation({
        projectId,
        accountId: googleAccountId,
        pack,
        jobId: options.jobId ?? null,
        headless: options.headless,
        maxTimeoutMs: options.maxTimeoutMs,
        correlationId,
      });

      const corr = sent.correlationId || correlationId;
      if (corr !== correlationId) {
        this.activeIds.set(requestId, corr);
      }

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
          (sent.errorMessage ?? userMessageForStatus(status)) || 'Yêu cầu AI thất bại.',
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
    await this.geminiService.close().catch(() => undefined);
  }
}
