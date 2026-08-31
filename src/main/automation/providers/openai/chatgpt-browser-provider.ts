import type { Page } from 'playwright';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AutomationError } from '../../errors/automation-errors';
import { BrowserConversationHarness } from '../../conversation/browser-conversation-harness';
import { ChatGptSurfaceAdapter } from '../../conversation/adapters/chatgpt-surface-adapter';

const CHATGPT_BASE_URL = 'https://chatgpt.com/';

export class ChatGptBrowserProvider {
  private page: Page | null = null;
  private cancelled = false;
  private readonly adapter = new ChatGptSurfaceAdapter();
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
      throw new AutomationError('UNKNOWN_UI', 'ChatGPT browser page not attached');
    }
    return this.page;
  }

  private async navigate(page: Page): Promise<void> {
    await page.goto(CHATGPT_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(800);
    const surface = await this.adapter.detectSurface();
    if (!surface.ok) {
      throw new AutomationError(
        'LOGIN_REQUIRED',
        'ChatGPT chưa đăng nhập hoặc trang không tải được.',
      );
    }
  }

  private async newChat(page: Page): Promise<void> {
    try {
      const btn = page
        .locator(
          'a[data-testid="create-new-chat-button"], a:has-text("New chat"), a:has-text("Đoạn chat mới")',
        )
        .first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(800);
        return;
      }
    } catch {
      // fall through
    }
    await page.goto(CHATGPT_BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  }
}
