import {
  AI_PROVIDER_IDS,
  geminiWebSessionSecretKey,
} from '@shared/constants/ai-provider';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import type { DatabaseManager } from '../../db/database-manager';
import type { SecretStorageService } from '../../security/secret-storage-service';
import type { IAIProvider } from '../iai-provider';
import type {
  AIProviderHealth,
  AIProviderStatusSnapshot,
  AIResponse,
  SendPromptOptions,
} from '../types';
import { mapWorkerStatus, userMessageForStatus } from '../error-map';
import { workerProcessManager } from '../worker-process-manager';
import { newId } from '../../db/utils/uuid';
import { logger } from '../../logging/logger';

interface WorkerChatResponse {
  request_id: string;
  status: string;
  text?: string;
  usage?: unknown;
  error?: string | null;
}

export class GeminiWebApiProvider implements IAIProvider {
  readonly providerId = AI_PROVIDER_IDS.GEMINI_WEB_API;
  readonly providerType = 'GEMINI_WEB_API' as const;

  private readonly cancelled = new Set<string>();

  constructor(
    private readonly db: DatabaseManager,
    private readonly secretStorage: SecretStorageService,
  ) {}

  async initialize(): Promise<void> {
    const install = workerProcessManager.detectInstall();
    if (!install.ok) {
      this.db.aiProviders.setStatus(this.providerId, 'ERROR');
      return;
    }
    try {
      await workerProcessManager.ensureStarted();
      const accounts = this.db.aiAccounts.listReadyByProvider(this.providerId);
      this.db.aiProviders.setStatus(
        this.providerId,
        accounts.length > 0 ? 'READY' : 'LOGIN_REQUIRED',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Gemini Web API worker start failed', { message });
      this.db.aiProviders.setStatus(this.providerId, 'ERROR');
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const runtime = workerProcessManager.getStatus();
    if (!runtime.installed) {
      return {
        ok: false,
        status: 'ERROR',
        message: runtime.message,
      };
    }
    if (!runtime.running) {
      try {
        await workerProcessManager.ensureStarted();
      } catch (error) {
        return {
          ok: false,
          status: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    try {
      const res = await this.workerFetch('/health');
      if (!res.ok) {
        return { ok: false, status: 'ERROR', message: `Worker HTTP ${res.status}` };
      }
    } catch (error) {
      return {
        ok: false,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Worker unreachable',
      };
    }

    const accounts = this.db.aiAccounts.listByProvider(this.providerId);
    const ready = accounts.find((a) => a.status === 'READY');
    if (!ready) {
      return {
        ok: false,
        status: 'LOGIN_REQUIRED',
        message: 'Chưa có tài khoản Gemini Web API sẵn sàng.',
        accountEmail: null,
        lastError: null,
      };
    }

    return {
      ok: true,
      status: 'READY',
      message: 'Gemini Web API sẵn sàng',
      accountEmail: ready.google_email,
      lastUsedAt: ready.last_used_at,
      lastError: ready.last_error,
    };
  }

  async sendPrompt(
    pack: TranslationPackDto,
    options?: SendPromptOptions,
  ): Promise<AIResponse> {
    const requestId = options?.requestId ?? newId();
    if (this.cancelled.has(requestId)) {
      this.cancelled.delete(requestId);
      return {
        requestId,
        status: 'ERROR',
        text: '',
        errorCode: 'CANCELLED',
        errorMessage: 'Request cancelled',
        providerType: this.providerType,
        providerId: this.providerId,
      };
    }

    try {
      await workerProcessManager.ensureStarted();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        requestId,
        status: 'SERVICE_UNAVAILABLE',
        text: '',
        errorCode: 'WORKER_DOWN',
        errorMessage: message,
        providerType: this.providerType,
        providerId: this.providerId,
      };
    }

    const account = this.resolveAccount(options);
    if (!account) {
      return {
        requestId,
        status: 'LOGIN_REQUIRED',
        text: '',
        errorCode: 'NO_AI_ACCOUNT',
        errorMessage: 'Tài khoản Google cần đăng nhập lại.',
        providerType: this.providerType,
        providerId: this.providerId,
      };
    }

    const model =
      options?.model ??
      this.db.aiModels.listEnabledByProvider(this.providerId).at(0)?.model_name ??
      null;

    // Worker process loses in-memory sessions on restart while DB stays READY.
    await this.restoreSessionFromSecret(account.id);

    const chatBody = {
      request_id: requestId,
      account_id: account.id,
      model,
      prompt: pack.prompt,
      system_instruction: null,
      attachments: null,
      options: { job_id: options?.jobId ?? null },
    };

    try {
      let res = await this.workerFetch('/gemini/chat', {
        method: 'POST',
        body: JSON.stringify(chatBody),
      });

      let data = (await res.json()) as WorkerChatResponse;
      let status = mapWorkerStatus(data.status);

      if (status === 'LOGIN_REQUIRED' || status === 'SESSION_EXPIRED') {
        const restored = await this.restoreSessionFromSecret(account.id);
        if (restored) {
          res = await this.workerFetch('/gemini/chat', {
            method: 'POST',
            body: JSON.stringify({ ...chatBody, request_id: `${requestId}-retry` }),
          });
          data = (await res.json()) as WorkerChatResponse;
          status = mapWorkerStatus(data.status);
        }
      }

      if (status === 'SUCCESS') {
        this.db.aiAccounts.markUsed(account.id);
        this.db.aiProviders.setStatus(this.providerId, 'READY');
        return {
          requestId: data.request_id || requestId,
          status: 'SUCCESS',
          text: data.text ?? '',
          providerType: this.providerType,
          providerId: this.providerId,
        };
      }

      if (status === 'LOGIN_REQUIRED' || status === 'SESSION_EXPIRED') {
        this.db.aiAccounts.setStatus(account.id, 'LOGIN_REQUIRED', data.error ?? null);
        this.db.aiProviders.setStatus(this.providerId, 'LOGIN_REQUIRED');
      }

      return {
        requestId: data.request_id || requestId,
        status,
        text: '',
        errorCode: status,
        errorMessage: data.error ?? userMessageForStatus(status),
        providerType: this.providerType,
        providerId: this.providerId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = mapWorkerStatus(message);
      return {
        requestId,
        status: status === 'UNKNOWN' ? 'NETWORK_ERROR' : status,
        text: '',
        errorCode: 'WORKER_HTTP',
        errorMessage: userMessageForStatus(
          status === 'UNKNOWN' ? 'NETWORK_ERROR' : status,
        ),
        providerType: this.providerType,
        providerId: this.providerId,
      };
    }
  }

  async cancelRequest(requestId: string): Promise<void> {
    this.cancelled.add(requestId);
    try {
      await this.workerFetch('/gemini/cancel', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId }),
      });
    } catch {
      // best-effort
    }
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
    this.cancelled.clear();
    await Promise.resolve();
  }

  /**
   * Push cookies into worker session (plaintext only in this call).
   */
  async initSession(input: {
    accountId: string;
    sessionDir: string;
    secure1psid: string;
    secure1psidts?: string;
    email?: string | null;
  }): Promise<{ status: string; error?: string }> {
    await workerProcessManager.ensureStarted();
    const res = await this.workerFetch('/gemini/session/init', {
      method: 'POST',
      body: JSON.stringify({
        account_id: input.accountId,
        session_dir: input.sessionDir,
        secure_1psid: input.secure1psid,
        secure_1psidts: input.secure1psidts ?? '',
        email: input.email ?? null,
      }),
    });
    const data = (await res.json()) as { status: string; error?: string };
    return data;
  }

  async storeAndInitSession(input: {
    accountId: string;
    secure1psid: string;
    secure1psidts?: string;
    email?: string | null;
  }): Promise<{ status: string; error?: string }> {
    const account = this.db.aiAccounts.getById(input.accountId);
    if (!account) throw new Error('AI account not found');

    const payload = JSON.stringify({
      secure1psid: input.secure1psid,
      secure1psidts: input.secure1psidts ?? '',
    });

    await this.secretStorage.replace({
      secretKey: geminiWebSessionSecretKey(input.accountId),
      plainText: payload,
      kind: 'gemini_web_session',
      ownerType: 'ai_account',
      ownerId: input.accountId,
    });

    const result = await this.initSession({
      accountId: input.accountId,
      sessionDir: account.session_location,
      secure1psid: input.secure1psid,
      secure1psidts: input.secure1psidts,
      email: input.email ?? account.google_email,
    });

    if (result.status === 'SUCCESS') {
      this.db.aiAccounts.setStatus(input.accountId, 'READY', null);
      if (input.email) this.db.aiAccounts.updateEmail(input.accountId, input.email);
      this.db.aiProviders.setStatus(this.providerId, 'READY');
    } else {
      const accountStatus =
        result.status === 'LOGIN_REQUIRED' || result.status === 'SESSION_EXPIRED'
          ? 'LOGIN_REQUIRED'
          : 'ERROR';
      this.db.aiAccounts.setStatus(input.accountId, accountStatus, result.error ?? null);
    }
    return result;
  }

  /** Re-init worker session from encrypted secret (after worker restart). */
  async restoreSessionFromSecret(accountId: string): Promise<boolean> {
    const account = this.db.aiAccounts.getById(accountId);
    if (!account) return false;
    const row = this.secretStorage.getMeta(geminiWebSessionSecretKey(accountId));
    if (!row) return false;
    try {
      const plain = await this.secretStorage.getPlainText(
        geminiWebSessionSecretKey(accountId),
      );
      if (!plain) return false;
      const parsed = JSON.parse(plain) as {
        secure1psid: string;
        secure1psidts?: string;
      };
      const result = await this.initSession({
        accountId,
        sessionDir: account.session_location,
        secure1psid: parsed.secure1psid,
        secure1psidts: parsed.secure1psidts,
        email: account.google_email,
      });
      return result.status === 'SUCCESS';
    } catch {
      return false;
    }
  }

  private resolveAccount(options?: SendPromptOptions) {
    // Mapped account only — ProjectWorkerResolver / caller must pass
    // googleAccountId or aiAccountId. Never blind first READY.
    if (options?.aiAccountId) {
      return this.db.aiAccounts.getById(options.aiAccountId);
    }
    if (options?.googleAccountId) {
      const linked = this.db.aiAccounts.findReadyForGoogleAccount(
        this.providerId,
        options.googleAccountId,
      );
      if (linked) return linked;
    }
    return null;
  }

  private async workerFetch(pathname: string, init?: RequestInit): Promise<Response> {
    const status = workerProcessManager.getStatus();
    return fetch(`${status.baseUrl}${pathname}`, {
      ...init,
      headers: (() => {
        const headers = new Headers(init?.headers);
        headers.set('Content-Type', 'application/json');
        headers.set('X-NTS-Secret', status.secret);
        return headers;
      })(),
    });
  }
}
