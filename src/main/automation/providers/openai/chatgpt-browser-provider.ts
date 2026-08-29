import type { Page } from 'playwright';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AutomationError } from '../../errors/automation-errors';

const CHATGPT_BASE_URL = 'https://chatgpt.com/';

const PROMPT_INPUT_SELECTORS = [
  '#prompt-textarea',
  '[data-testid="prompt-textarea"]',
  '[data-testid="composer"] div[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  '.ProseMirror[contenteditable="true"]',
  'div[contenteditable="true"]',
];

const RESPONSE_SELECTORS = [
  '[data-message-author-role="assistant"] .markdown',
  '[data-message-author-role="assistant"]',
  '[data-testid*="conversation-turn"] .markdown',
];

const GENERATING_SELECTORS = [
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
  'button[aria-label="Dừng tạo"]',
  '.result-streaming',
];

const SEND_BUTTON_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[data-testid="composer-send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Send message"]',
  'button[aria-label="Gửi tin nhắn"]',
  'button[aria-label="Gửi"]',
];

export class ChatGptBrowserProvider {
  private page: Page | null = null;
  private responseCountBefore = 0;
  private cancelled = false;

  attachPage(page: Page): void {
    this.page = page;
  }

  async cancelGeneration(): Promise<void> {
    this.cancelled = true;
    const page = this.page;
    if (!page) return;
    for (const sel of GENERATING_SELECTORS) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => undefined);
        break;
      }
    }
  }

  async sendPack(pack: TranslationPackDto, maxTimeoutMs: number): Promise<string> {
    this.cancelled = false;
    const page = this.requirePage();
    await this.navigate(page);
    await this.newChat(page);
    await this.typePrompt(page, pack.prompt);
    await this.sendPrompt(page);
    return this.waitForResponse(page, maxTimeoutMs);
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
    const inputSel = PROMPT_INPUT_SELECTORS.join(', ');
    try {
      await page.waitForSelector(inputSel, { timeout: 12_000 });
    } catch {
      throw new AutomationError(
        'LOGIN_REQUIRED',
        'ChatGPT chưa đăng nhập hoặc trang không tải được.',
      );
    }
  }

  private async newChat(page: Page): Promise<void> {
    try {
      const btn = page.locator(
        'a[data-testid="create-new-chat-button"], a:has-text("New chat"), a:has-text("Đoạn chat mới")',
      ).first();
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

  private async findPromptInput(page: Page) {
    for (const sel of PROMPT_INPUT_SELECTORS) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
        return loc;
      }
    }
    throw new AutomationError('SELECTOR_NOT_FOUND', 'Không tìm thấy ô nhập ChatGPT.');
  }

  private async typePrompt(page: Page, text: string): Promise<void> {
    if (!text.trim()) return;
    const input = await this.findPromptInput(page);
    await input.click();
    await page.waitForTimeout(150);
    const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'textarea') {
      await input.fill(text);
    } else {
      await page.keyboard.press('Control+A').catch(() => undefined);
      await page.keyboard.press('Backspace').catch(() => undefined);
      await page.keyboard.insertText(text);
    }
    await page.waitForTimeout(250);
  }

  private async sendPrompt(page: Page): Promise<void> {
    this.responseCountBefore = await page
      .locator('[data-message-author-role="assistant"]')
      .count();
    void this.responseCountBefore;
    for (const sel of SEND_BUTTON_SELECTORS) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false) && (await btn.isEnabled().catch(() => false))) {
        await btn.click();
        return;
      }
    }
    await page.keyboard.press('Enter');
  }

  private async waitForResponse(page: Page, timeoutMs: number): Promise<string> {
    const start = Date.now();
    let lastContent = '';
    let stableCount = 0;
    await page.waitForTimeout(2000);

    while (Date.now() - start < timeoutMs) {
      if (this.cancelled) {
        throw new AutomationError('GENERATION_ERROR', 'ChatGPT generation cancelled');
      }

      const { content, isGenerating } = await page.evaluate(
        ({ responseSelectors, generatingSelectors }) => {
          const isGenerating = generatingSelectors.some((sel) =>
            Boolean(document.querySelector(sel)),
          );
          let content = '';
          for (const sel of responseSelectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
              const last = elements[elements.length - 1];
              content = (last?.textContent ?? '').trim();
              if (content) break;
            }
          }
          return { content, isGenerating };
        },
        { responseSelectors: RESPONSE_SELECTORS, generatingSelectors: GENERATING_SELECTORS },
      );

      if (!isGenerating && content.length > 0) {
        if (content === lastContent) {
          stableCount += 1;
          if (stableCount >= 3) return content;
        } else {
          stableCount = 0;
        }
      } else {
        stableCount = 0;
      }
      lastContent = content || lastContent;
      await page.waitForTimeout(2000);
    }

    if (lastContent) return lastContent;
    throw new AutomationError('RESPONSE_TIMEOUT', 'ChatGPT không phản hồi trong thời gian quy định.');
  }
}
