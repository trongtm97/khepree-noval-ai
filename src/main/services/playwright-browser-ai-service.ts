import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { DatabaseManager } from '../db/database-manager';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import {
  AI_PROVIDER_IDS,
  type AiProviderType,
} from '@shared/constants/ai-provider';
import { DEFAULT_GENERATION_MAX_TIMEOUT_MS } from '@shared/constants/gemini';
import { ChatGptBrowserProvider } from '../automation/providers/openai/chatgpt-browser-provider';
import { MetaAiBrowserProvider } from '../automation/providers/meta/meta-ai-browser-provider';
import { browserProfileManager } from '../automation/browser-runner/profile-manager';
import { profileLockManager, startLeaseHeartbeat } from '../automation/browser-runner/profile-lock';
import { getBrowserRuntimeManager } from '../automation/browser-runner/browser-runtime-manager';
import { launchKhepreeNovelAIPersistentContext } from '../automation/browser-runner/launch-persistent-context';
import { AutomationError } from '../automation/errors/automation-errors';
import { pathsService } from './paths-service';
import { logger } from '../logging/logger';
import { newId } from '../db/utils/uuid';

export interface BrowserAiSendResult {
  correlationId: string;
  status: 'completed' | 'failed';
  rawResponse: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

type BrowserAiSite = 'chatgpt' | 'metaai';

const SITE_LOGIN_URL: Record<BrowserAiSite, string> = {
  chatgpt: 'https://chatgpt.com/',
  metaai: 'https://www.meta.ai/',
};

export class PlaywrightBrowserAiService {
  private readonly active = new Map<
    string,
    { cancel: () => Promise<void> }
  >();
  private readonly loginContexts = new Map<string, BrowserContext>();
  private readonly loginHeartbeats = new Map<string, () => void>();

  constructor(private readonly db: DatabaseManager) {}

  async cancelActive(correlationId: string): Promise<boolean> {
    const entry = this.active.get(correlationId);
    if (!entry) return false;
    await entry.cancel();
    return true;
  }

  async close(): Promise<void> {
    for (const entry of this.active.values()) {
      await entry.cancel().catch(() => undefined);
    }
    this.active.clear();
    for (const [accountId, ctx] of this.loginContexts.entries()) {
      await ctx.close().catch(() => undefined);
      this.loginContexts.delete(accountId);
      this.stopLoginHeartbeat(accountId);
    }
  }

  async sendTranslation(input: {
    providerType: Extract<AiProviderType, 'PLAYWRIGHT_CHATGPT' | 'PLAYWRIGHT_META_AI'>;
    aiAccountId: string;
    pack: TranslationPackDto;
    headless?: boolean;
    maxTimeoutMs?: number;
    jobId?: string | null;
    correlationId?: string | null;
  }): Promise<BrowserAiSendResult> {
    const account = this.db.aiAccounts.getById(input.aiAccountId);
    if (!account) {
      throw new Error(`AI account not found: ${input.aiAccountId}`);
    }

    const profileDirName = account.profile_dir_name;
    if (!profileDirName) {
      return {
        correlationId: input.correlationId ?? newId(),
        status: 'failed',
        rawResponse: '',
        errorCode: 'MISSING_PROFILE',
        errorMessage: 'Browser profile chưa được tạo cho tài khoản AI.',
      };
    }

    const profilePath = browserProfileManager.resolveProfilePath(profileDirName);
    const site = input.providerType === 'PLAYWRIGHT_CHATGPT' ? 'chatgpt' : 'metaai';
    const correlationId = input.correlationId ?? newId();
    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      'ai-browser',
      input.aiAccountId,
      site,
    );

    const provider =
      site === 'chatgpt' ? new ChatGptBrowserProvider() : new MetaAiBrowserProvider();

    const runtimeManager = getBrowserRuntimeManager();
    const maxTimeoutMs = input.maxTimeoutMs ?? DEFAULT_GENERATION_MAX_TIMEOUT_MS;

    try {
      const rawResponse = await runtimeManager.runExclusive(
        {
          accountId: input.aiAccountId,
          profilePath,
          diagnosticsDir,
          headless: input.headless,
          jobId: input.jobId,
        },
        async ({ runtime }) => {
          const page = await this.ensureSitePage(runtime.ensureContext.bind(runtime), site);
          provider.attachPage(page);
          this.active.set(correlationId, {
            cancel: () => provider.cancelGeneration(),
          });
          return provider.sendPack(input.pack, maxTimeoutMs);
        },
      );

      this.db.aiAccounts.markUsed(input.aiAccountId);
      return {
        correlationId,
        status: 'completed',
        rawResponse,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        error instanceof AutomationError ? error.code : 'ERROR';
      logger.warn('Browser AI send failed', {
        providerType: input.providerType,
        aiAccountId: input.aiAccountId,
        code,
        message,
      });
      return {
        correlationId,
        status: 'failed',
        rawResponse: '',
        errorCode: code,
        errorMessage: message,
      };
    } finally {
      this.active.delete(correlationId);
    }
  }

  async openLoginBrowser(input: {
    aiAccountId: string;
    providerType: Extract<AiProviderType, 'PLAYWRIGHT_CHATGPT' | 'PLAYWRIGHT_META_AI'>;
  }): Promise<{ ok: boolean; message: string }> {
    const account = this.db.aiAccounts.getById(input.aiAccountId);
    if (!account?.profile_dir_name) {
      return { ok: false, message: 'Tài khoản AI không có browser profile.' };
    }

    const site: BrowserAiSite =
      input.providerType === 'PLAYWRIGHT_CHATGPT' ? 'chatgpt' : 'metaai';
    const profilePath = browserProfileManager.resolveProfilePath(account.profile_dir_name);
    profileLockManager.recoverIfStale(profilePath);

    if (profileLockManager.isLocked(profilePath)) {
      const owner = profileLockManager.getOwner(profilePath);
      if (owner !== input.aiAccountId) {
        return {
          ok: false,
          message: 'Profile đang được dùng bởi job khác. Thử lại sau.',
        };
      }
    }

    const existing = this.loginContexts.get(input.aiAccountId);
    if (existing) {
      const page = existing.pages()[0] ?? (await existing.newPage());
      await page.goto(SITE_LOGIN_URL[site], { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return {
        ok: true,
        message: `Đã mở ${site === 'chatgpt' ? 'ChatGPT' : 'Meta AI'} — đăng nhập rồi bấm Xác minh.`,
      };
    }

    try {
      await getBrowserRuntimeManager().evictForExternalLaunch(input.aiAccountId);
    } catch {
      // ignore
    }

    profileLockManager.acquireLease({
      profilePath,
      ownerId: input.aiAccountId,
      accountId: input.aiAccountId,
      operation: 'manual_browser',
      label: 'AI browser login',
    });
    this.loginHeartbeats.set(
      input.aiAccountId,
      startLeaseHeartbeat(profileLockManager, {
        profilePath,
        ownerId: input.aiAccountId,
      }),
    );

    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      'ai-browser',
      input.aiAccountId,
      'login',
    );

    const launched = await launchKhepreeNovelAIPersistentContext({
      profilePath,
      headless: false,
      headlessDefault: false,
      diagnosticsDir,
    });
    this.loginContexts.set(input.aiAccountId, launched.context);
    launched.context.on('close', () => {
      this.loginContexts.delete(input.aiAccountId);
      this.stopLoginHeartbeat(input.aiAccountId);
      try {
        profileLockManager.releaseLease(profilePath, input.aiAccountId);
      } catch {
        profileLockManager.recoverIfStale(profilePath);
      }
    });

    const page = launched.context.pages()[0] ?? (await launched.context.newPage());
    await page.goto(SITE_LOGIN_URL[site], { waitUntil: 'domcontentloaded', timeout: 60_000 });

    return {
      ok: true,
      message: `Đã mở ${site === 'chatgpt' ? 'ChatGPT' : 'Meta AI'} — đăng nhập rồi bấm Xác minh.`,
    };
  }

  private stopLoginHeartbeat(accountId: string): void {
    const stop = this.loginHeartbeats.get(accountId);
    if (stop) {
      stop();
      this.loginHeartbeats.delete(accountId);
    }
  }

  /** Close login browser, release profile lock, cancel in-flight sends before delete. */
  async releaseAccountResources(aiAccountId: string): Promise<void> {
    for (const [correlationId, entry] of this.active.entries()) {
      await entry.cancel().catch(() => undefined);
      this.active.delete(correlationId);
    }

    const account = this.db.aiAccounts.getById(aiAccountId);
    const profileDirName = account?.profile_dir_name;
    const profilePath = profileDirName
      ? browserProfileManager.resolveProfilePath(profileDirName)
      : null;

    const loginCtx = this.loginContexts.get(aiAccountId);
    if (loginCtx) {
      await loginCtx.close().catch(() => undefined);
      this.loginContexts.delete(aiAccountId);
    }
    this.stopLoginHeartbeat(aiAccountId);

    if (profilePath) {
      try {
        profileLockManager.releaseLease(profilePath, aiAccountId);
      } catch {
        profileLockManager.recoverIfStale(profilePath);
      }
      try {
        await getBrowserRuntimeManager().evictForExternalLaunch(aiAccountId);
      } catch {
        // ignore
      }
    }
  }

  async verifyLogin(input: {
    aiAccountId: string;
    providerType: Extract<AiProviderType, 'PLAYWRIGHT_CHATGPT' | 'PLAYWRIGHT_META_AI'>;
  }): Promise<{ ok: boolean; status: string; message: string }> {
    const account = this.db.aiAccounts.getById(input.aiAccountId);
    if (!account?.profile_dir_name) {
      return { ok: false, status: 'ERROR', message: 'Thiếu browser profile.' };
    }

    const site: BrowserAiSite =
      input.providerType === 'PLAYWRIGHT_CHATGPT' ? 'chatgpt' : 'metaai';
    const profilePath = browserProfileManager.resolveProfilePath(account.profile_dir_name);
    const diagnosticsDir = path.join(
      pathsService.getPath('cache'),
      'automation',
      'ai-browser',
      input.aiAccountId,
      'verify',
    );

    try {
      let page: Page | null = null;
      const openCtx = this.loginContexts.get(input.aiAccountId);
      if (openCtx) {
        page = openCtx.pages()[0] ?? null;
      }

      if (!page) {
        const launched = await launchKhepreeNovelAIPersistentContext({
          profilePath,
          headless: true,
          headlessDefault: true,
          diagnosticsDir,
        });
        page = launched.context.pages()[0] ?? (await launched.context.newPage());
        await page.goto(SITE_LOGIN_URL[site], { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1500);
        const loggedIn =
          site === 'chatgpt'
            ? await this.isChatGptLoggedIn(page)
            : await this.isMetaAiLoggedIn(page);
        await launched.context.close().catch(() => undefined);
        if (loggedIn) {
          this.db.aiAccounts.setStatus(input.aiAccountId, 'READY', null);
          const providerId =
            input.providerType === 'PLAYWRIGHT_CHATGPT'
              ? AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT
              : AI_PROVIDER_IDS.PLAYWRIGHT_META_AI;
          this.db.aiProviders.setStatus(providerId, 'READY');
          return { ok: true, status: 'READY', message: 'Tài khoản AI sẵn sàng.' };
        }
        this.db.aiAccounts.setStatus(
          input.aiAccountId,
          'LOGIN_REQUIRED',
          'Chưa đăng nhập trên browser profile.',
        );
        return {
          ok: false,
          status: 'LOGIN_REQUIRED',
          message: 'Chưa phát hiện phiên đăng nhập. Mở trình duyệt và đăng nhập lại.',
        };
      }

      await page.waitForTimeout(500);
      const loggedIn =
        site === 'chatgpt'
          ? await this.isChatGptLoggedIn(page)
          : await this.isMetaAiLoggedIn(page);

      if (loggedIn) {
        this.db.aiAccounts.setStatus(input.aiAccountId, 'READY', null);
        const providerId =
          input.providerType === 'PLAYWRIGHT_CHATGPT'
            ? AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT
            : AI_PROVIDER_IDS.PLAYWRIGHT_META_AI;
        this.db.aiProviders.setStatus(providerId, 'READY');
        return { ok: true, status: 'READY', message: 'Tài khoản AI sẵn sàng.' };
      }

      this.db.aiAccounts.setStatus(
        input.aiAccountId,
        'LOGIN_REQUIRED',
        'Chưa đăng nhập trên browser profile.',
      );
      return {
        ok: false,
        status: 'LOGIN_REQUIRED',
        message: 'Chưa phát hiện phiên đăng nhập. Mở trình duyệt và đăng nhập lại.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.aiAccounts.setStatus(input.aiAccountId, 'ERROR', message);
      return { ok: false, status: 'ERROR', message };
    }
  }

  private async ensureSitePage(
    ensureContext: () => Promise<Page>,
    site: BrowserAiSite,
  ): Promise<Page> {
    const page = await ensureContext();
    const url = page.url();
    const onTarget =
      site === 'chatgpt' ? url.includes('chatgpt.com') : url.includes('meta.ai');
    if (!onTarget) {
      await page.goto(SITE_LOGIN_URL[site], {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    }
    return page;
  }

  private async isChatGptLoggedIn(page: Page): Promise<boolean> {
    const selectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'div[contenteditable="true"][role="textbox"]',
    ].join(', ');
    try {
      await page.waitForSelector(selectors, { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }

  private async isMetaAiLoggedIn(page: Page): Promise<boolean> {
    if ((await page.locator('[data-testid="user-menu-button"]').count()) > 0) return true;
    const loginBtn = await page
      .locator('button:has-text("Đăng nhập"), button:has-text("Log in")')
      .count();
    return loginBtn === 0 && (await page.locator('[data-testid="composer-input"]').count()) > 0;
  }
}
