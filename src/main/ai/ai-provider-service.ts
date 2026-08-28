import path from 'node:path';
import fs from 'node:fs';
import type { DatabaseManager } from '../db/database-manager';
import type { SecretStorageService } from '../security/secret-storage-service';
import {
  AI_PROVIDER_IDS,
  geminiWebSessionSecretKey,
  type AiProviderType,
} from '@shared/constants/ai-provider';
import type {
  AiAccountDto,
  AiModelDto,
  AiProviderDto,
} from '@shared/schemas/ai-provider';
import { AiProviderManager } from './ai-provider-manager';
import { PlaywrightGeminiAdapter } from './adapters/playwright-gemini-adapter';
import { GeminiWebApiProvider } from './adapters/gemini-webapi-provider';
import { workerProcessManager } from './worker-process-manager';
import { pathsService } from '../services/paths-service';
import type { GeminiService } from '../services/gemini-service';
import { logger } from '../logging/logger';
import { getSecretStorage } from '../security';
import { summarizeLinkedAiAccount } from './provider-account-summary';

export class AiProviderService {
  readonly manager: AiProviderManager;
  readonly webApi: GeminiWebApiProvider;

  constructor(
    private readonly db: DatabaseManager,
    geminiService: GeminiService,
    secretStorage: SecretStorageService,
  ) {
    this.manager = new AiProviderManager(db);
    this.webApi = new GeminiWebApiProvider(db, secretStorage);
    this.manager.register(this.webApi);
    this.manager.register(new PlaywrightGeminiAdapter(geminiService));
  }

  async initialize(): Promise<void> {
    await this.manager.initialize();
  }

  async shutdown(): Promise<void> {
    await this.manager.close();
    await workerProcessManager.stop();
  }

  listProviders(): {
    providers: AiProviderDto[];
    fallbackEnabled: boolean;
    fallbackStatuses: string[];
    workerInstalled: boolean;
    workerRunning: boolean;
    workerMessage: string | null;
  } {
    const runtime = workerProcessManager.getStatus();
    const providers = this.db.aiProviders.listAll().map((row) => {
      const linked = summarizeLinkedAiAccount(this.db.aiAccounts.listByProvider(row.id));
      const models = this.db.aiModels.listByProvider(row.id);
      return {
        id: row.id,
        name: row.name,
        type: row.type as AiProviderType,
        status: row.status as AiProviderDto['status'],
        priority: row.priority,
        enabled: row.enabled === 1,
        fallbackAllowed: row.fallback_allowed === 1,
        accountEmail: linked.accountEmail,
        lastUsedAt: linked.lastUsedAt,
        lastError: linked.lastError,
        modelCount: models.length,
      };
    });

    return {
      providers,
      fallbackEnabled: this.manager.isFallbackEnabled(),
      fallbackStatuses: this.manager.getFallbackStatuses(),
      workerInstalled: runtime.installed,
      workerRunning: runtime.running,
      workerMessage: runtime.message,
    };
  }

  async healthReport() {
    const result = [];
    for (const provider of this.manager.listRegistered()) {
      const row = this.db.aiProviders.getById(provider.providerId);
      const name = row?.name ?? provider.providerType;
      try {
        const health = await provider.healthCheck();
        result.push({
          id: provider.providerId,
          type: provider.providerType,
          name,
          ok: health.ok,
          status: health.status,
          message: health.message,
          accountEmail: health.accountEmail ?? null,
          lastUsedAt: health.lastUsedAt ?? null,
          lastError: health.lastError ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Provider healthCheck failed', {
          providerId: provider.providerId,
          message,
        });
        result.push({
          id: provider.providerId,
          type: provider.providerType,
          name,
          ok: false,
          status: 'ERROR' as const,
          message,
          accountEmail: null,
          lastUsedAt: null,
          lastError: message,
        });
      }
    }
    return { providers: result };
  }

  setPriority(providerId: string, priority: number) {
    const row = this.db.aiProviders.setPriority(providerId, priority);
    if (!row) throw new Error('Provider not found');
    return row;
  }

  /** Swap with the previous provider in priority order (raise one step). */
  promoteProvider(providerId: string) {
    const ordered = this.db.aiProviders.listAll();
    const index = ordered.findIndex((row) => row.id === providerId);
    if (index < 0) throw new Error('Provider not found');
    const current = ordered[index];
    if (index === 0) return current;
    const previous = ordered[index - 1];
    if (current.priority === previous.priority) {
      this.db.aiProviders.setPriority(previous.id, previous.priority + 1);
      return this.db.aiProviders.getById(providerId) ?? current;
    }
    this.db.aiProviders.setPriority(current.id, previous.priority);
    this.db.aiProviders.setPriority(previous.id, current.priority);
    return this.db.aiProviders.getById(providerId) ?? current;
  }

  setEnabled(providerId: string, enabled: boolean) {
    const row = this.db.aiProviders.setEnabled(providerId, enabled);
    if (!row) throw new Error('Provider not found');
    return row;
  }

  setFallback(enabled: boolean, statuses?: string[]) {
    this.manager.setFallbackConfig(
      enabled,
      statuses as Parameters<AiProviderManager['setFallbackConfig']>[1],
    );
  }

  async checkProvider(
    providerId: string,
    context?: { accountId?: string; projectId?: string },
  ) {
    if (context?.accountId && context.projectId) {
      const { checkProviderForJob } = await import('./provider-preflight');
      const report = await checkProviderForJob(this.db, {
        accountId: context.accountId,
        projectId: context.projectId,
        providerId,
        notebookRole: 'RESEARCH',
        requireNotebook: false,
        lightweight: true,
      });
      const status =
        report.result === 'READY' || report.result === 'DEGRADED'
          ? ('READY' as const)
          : report.result === 'NEEDS_LOGIN'
            ? ('LOGIN_REQUIRED' as const)
            : ('ERROR' as const);
      this.db.aiProviders.setStatus(providerId, status);
      return {
        ok: report.result === 'READY' || report.result === 'DEGRADED',
        status,
        message: report.message,
        preflight: report.result,
        checks: report.checks,
      };
    }
    const provider = this.manager.getProvider(providerId);
    if (!provider) throw new Error('Provider not registered');
    const health = await provider.healthCheck();
    this.db.aiProviders.setStatus(providerId, health.status);
    return health;
  }

  listAccounts(providerId?: string): AiAccountDto[] {
    const rows = providerId
      ? this.db.aiAccounts.listByProvider(providerId)
      : this.db.aiAccounts.listAll();
    return rows.map((row) => {
      const provider = this.db.aiProviders.getById(row.provider_id);
      return {
        id: row.id,
        providerId: row.provider_id,
        providerType: provider?.type as AiProviderType | undefined,
        googleAccountId: row.google_account_id,
        googleEmail: row.google_email,
        sessionLocation: row.session_location,
        status: row.status as AiAccountDto['status'],
        lastUsedAt: row.last_used_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  createAccount(input: {
    providerId: string;
    googleAccountId?: string | null;
    googleEmail?: string | null;
  }): AiAccountDto {
    const provider = this.db.aiProviders.getById(input.providerId);
    if (!provider) throw new Error('Provider not found');
    if (provider.type !== 'GEMINI_WEB_API') {
      throw new Error('Chỉ Gemini Web API dùng tài khoản session riêng trong bảng này');
    }

    const idPlaceholder = 'pending';
    const baseDir = path.join(
      pathsService.getPath('data'),
      'gemini-webapi-profiles',
    );
    fs.mkdirSync(baseDir, { recursive: true });

    // Create with temp path then rename — need id first
    const sessionTemp = path.join(baseDir, idPlaceholder);
    const row = this.db.aiAccounts.create({
      provider_id: input.providerId,
      google_account_id: input.googleAccountId ?? null,
      google_email: input.googleEmail ?? null,
      session_location: sessionTemp,
      status: 'LOGIN_REQUIRED',
    });

    const sessionLocation = path.join(baseDir, row.id);
    fs.mkdirSync(sessionLocation, { recursive: true });
    this.db.getConnection()
      .prepare(`UPDATE ai_accounts SET session_location = ? WHERE id = ?`)
      .run(sessionLocation, row.id);

    const updated = this.db.aiAccounts.getById(row.id);
    if (!updated) throw new Error('Account not found after create');
    const listed = this.listAccounts(input.providerId).find((a) => a.id === updated.id);
    if (!listed) throw new Error('Account missing from list after create');
    return listed;
  }

  async pasteCookies(input: {
    accountId: string;
    secure1psid: string;
    secure1psidts?: string;
    googleEmail?: string;
  }): Promise<{ account: AiAccountDto; message: string }> {
    const result = await this.webApi.storeAndInitSession({
      accountId: input.accountId,
      secure1psid: input.secure1psid,
      secure1psidts: input.secure1psidts,
      email: input.googleEmail,
    });
    const account = this.listAccounts().find((a) => a.id === input.accountId);
    if (!account) throw new Error('Account not found after connect');
    return {
      account,
      message:
        result.status === 'SUCCESS'
          ? 'Kết nối Gemini Web API thành công.'
          : result.error ?? 'Kết nối thất bại.',
    };
  }

  /**
   * Auto-provision Gemini Web API account from a logged-in Google worker.
   * Called after Playwright login — no manual cookie paste.
   */
  async provisionFromGoogleAccount(input: {
    googleAccountId: string;
    googleEmail: string;
    secure1psid: string;
    secure1psidts?: string;
  }): Promise<{ account: AiAccountDto; status: string } | null> {
    if (!input.secure1psid.trim()) {
      logger.info('Skip Gemini Web API auto-provision: no PSID cookie', {
        googleAccountId: input.googleAccountId,
      });
      return null;
    }

    let install = workerProcessManager.detectInstall();
    if (!install.ok) {
      logger.info('Gemini Web API worker not installed; attempting auto-install', {
        googleAccountId: input.googleAccountId,
      });
      install = await workerProcessManager.install();
      if (!install.ok) {
        logger.warn('Gemini Web API auto-install failed; manual setup required', {
          googleAccountId: input.googleAccountId,
          message: install.message,
        });
        return null;
      }
    }

    const providerId = AI_PROVIDER_IDS.GEMINI_WEB_API;
    const existing = this.db.aiAccounts.findByGoogleAccount(
      providerId,
      input.googleAccountId,
    );

    let accountId: string;
    if (existing) {
      accountId = existing.id;
      this.db.aiAccounts.linkGoogleAccount(accountId, input.googleAccountId);
      if (input.googleEmail) {
        this.db.aiAccounts.updateEmail(accountId, input.googleEmail);
      }
    } else {
      const created = this.createAccount({
        providerId,
        googleAccountId: input.googleAccountId,
        googleEmail: input.googleEmail,
      });
      accountId = created.id;
    }

    const result = await this.webApi.storeAndInitSession({
      accountId,
      secure1psid: input.secure1psid,
      secure1psidts: input.secure1psidts,
      email: input.googleEmail,
    });

    this.db.aiAccounts.linkGoogleAccount(accountId, input.googleAccountId);

    const account = this.listAccounts().find((a) => a.id === accountId);
    if (!account) return null;

    if (result.status === 'SUCCESS') {
      logger.info('Gemini Web API auto-provisioned from Google login', {
        googleAccountId: input.googleAccountId,
        aiAccountId: accountId,
      });
    } else {
      logger.warn('Gemini Web API auto-provision session init failed', {
        googleAccountId: input.googleAccountId,
        aiAccountId: accountId,
        status: result.status,
        error: result.error,
      });
    }

    return { account, status: result.status };
  }

  async checkAccount(accountId: string): Promise<{ account: AiAccountDto; message: string }> {
    const restored = await this.webApi.restoreSessionFromSecret(accountId);
    if (!restored) {
      this.db.aiAccounts.setStatus(accountId, 'LOGIN_REQUIRED', 'Session restore failed');
    } else {
      this.db.aiAccounts.setStatus(accountId, 'READY', null);
      this.db.aiProviders.setStatus(AI_PROVIDER_IDS.GEMINI_WEB_API, 'READY');
    }
    const account = this.listAccounts().find((a) => a.id === accountId);
    if (!account) throw new Error('Account not found');
    return {
      account,
      message: restored ? 'Tài khoản sẵn sàng.' : 'Cần kết nối lại (cookie/session).',
    };
  }

  disableAccount(accountId: string): AiAccountDto {
    this.db.aiAccounts.setStatus(accountId, 'DISABLED', null);
    const account = this.listAccounts().find((a) => a.id === accountId);
    if (!account) throw new Error('Account not found');
    return account;
  }

  async deleteAccount(accountId: string): Promise<{ ok: boolean }> {
    await getSecretStorage().delete(geminiWebSessionSecretKey(accountId));
    const account = this.db.aiAccounts.getById(accountId);
    if (account?.session_location) {
      try {
        fs.rmSync(account.session_location, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
    this.db.aiAccounts.delete(accountId);
    return { ok: true };
  }

  listModels(providerId: string): AiModelDto[] {
    return this.db.aiModels.listByProvider(providerId).map((row) => {
      let capabilities: Record<string, unknown> | null = null;
      if (row.capabilities) {
        try {
          capabilities = JSON.parse(row.capabilities) as Record<string, unknown>;
        } catch {
          capabilities = null;
        }
      }
      return {
        id: row.id,
        providerId: row.provider_id,
        modelName: row.model_name,
        displayName: row.display_name,
        capabilities,
        enabled: row.enabled === 1,
      };
    });
  }

  async syncModelsFromWorker(accountId: string): Promise<AiModelDto[]> {
    const account = this.db.aiAccounts.getById(accountId);
    if (!account) throw new Error('Account not found');
    await this.webApi.restoreSessionFromSecret(accountId);
    const runtime = workerProcessManager.getStatus();
    const res = await fetch(
      `${runtime.baseUrl}/gemini/models?account_id=${encodeURIComponent(accountId)}`,
      { headers: { 'X-NTS-Secret': runtime.secret } },
    );
    const data = (await res.json()) as {
      status: string;
      models?: { model_name: string; display_name: string }[];
    };
    if (data.status === 'SUCCESS' && data.models) {
      for (const model of data.models) {
        this.db.aiModels.upsert({
          provider_id: account.provider_id,
          model_name: model.model_name,
          display_name: model.display_name,
          enabled: true,
        });
      }
    }
    return this.listModels(account.provider_id);
  }

  async installWorker() {
    return workerProcessManager.install();
  }

  workerStatus() {
    return workerProcessManager.getStatus();
  }
}
