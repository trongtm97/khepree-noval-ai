import type { Page } from 'playwright';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AutomationError } from '../../errors/automation-errors';
import { BrowserConversationHarness } from '../../conversation/browser-conversation-harness';
import { MetaAiSurfaceAdapter } from '../../conversation/adapters/meta-ai-surface-adapter';

const META_AI_URL = 'https://www.meta.ai/';

const SELECTORS = {
  composerInput: '[data-testid="composer-input"][contenteditable="true"]',
  newChat: '[data-testid="new-chat-button"], button:has-text("Đoạn chat mới")',
  userMenu: '[data-testid="user-menu-button"]',
  assistantMessage: '[data-testid="assistant-message"]',
  welcome: '[data-testid="welcome-message"]',
} as const;

export class MetaAiBrowserProvider {
  private page: Page | null = null;
  private cancelled = false;
  private readonly adapter = new MetaAiSurfaceAdapter();
  private readonly harness = new BrowserConversationHarness();

  attachPage(page: Page): void {
    this.page = page;
  }

  async cancelGeneration(): Promise<void> {
    this.cancelled = true;
    await this.adapter.cancelGeneration();
  }

  async sendPack(pack: TranslationPackDto, maxTimeoutMs: number): Promise<string> {
    this.cancelled = false;
    const page = this.requirePage();
    await this.navigate(page);
    await this.newChat(page);

    const result = await this.harness.run({
      page,
      adapter: this.adapter,
      prompt: pack.prompt,
      timeouts: {
        streamingMs: maxTimeoutMs,
        stabilizationMs: maxTimeoutMs,
      },
      isCancelled: () => this.cancelled,
    });
    return result.text;
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new AutomationError('UNKNOWN_UI', 'Meta AI browser page not attached');
    }
    return this.page;
  }

  private composerInput(page: Page) {
    return page.locator(SELECTORS.composerInput).last();
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    if ((await page.locator(SELECTORS.userMenu).count()) > 0) return true;
    const loginBtn = await page
      .locator('button:has-text("Đăng nhập"), a:has-text("Đăng nhập"), button:has-text("Log in")')
      .count();
    return loginBtn === 0;
  }

  private async navigate(page: Page): Promise<void> {
    const currentUrl = page.url();
    if (!currentUrl.includes('meta.ai')) {
      await page.goto(META_AI_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(1500);
    }
    await this.composerInput(page).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
    if (!(await this.isLoggedIn(page))) {
      throw new AutomationError(
        'LOGIN_REQUIRED',
        'Meta AI chưa đăng nhập. Mở trình duyệt và đăng nhập Facebook.',
      );
    }
  }

  private async newChat(page: Page): Promise<void> {
    const welcome = await page.locator(SELECTORS.welcome).count();
    const assistantCount = await page.locator(SELECTORS.assistantMessage).count();
    if (welcome > 0 || assistantCount === 0) return;

    const sidebar = page.locator(SELECTORS.newChat).first();
    if (await sidebar.count()) {
      await sidebar.click({ timeout: 8000, force: true }).catch(() => undefined);
      await page.waitForTimeout(1200);
      if ((await page.locator(SELECTORS.assistantMessage).count()) === 0) return;
    }

    await page.goto(META_AI_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
    await this.composerInput(page).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  }
}
