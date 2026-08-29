import type { Page } from 'playwright';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AutomationError } from '../../errors/automation-errors';

const META_AI_URL = 'https://www.meta.ai/';

const SELECTORS = {
  composerInput: '[data-testid="composer-input"][contenteditable="true"]',
  composerSend: '[data-testid="composer-send-button"]',
  newChat: '[data-testid="new-chat-button"], button:has-text("Đoạn chat mới")',
  userMenu: '[data-testid="user-menu-button"]',
  assistantMessage: '[data-testid="assistant-message"]',
  markdownContent: '.markdown-content',
} as const;

export class MetaAiBrowserProvider {
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
    const stop = page.locator(
      'button[aria-label*="Stop" i], button[title*="Stop" i], [data-testid*="stop" i]',
    ).first();
    if (await stop.isVisible().catch(() => false)) {
      await stop.click({ timeout: 2000 }).catch(() => undefined);
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
    const welcome = await page.locator('[data-testid="welcome-message"]').count();
    const assistantCount = await page.locator(SELECTORS.assistantMessage).count();
    if (welcome > 0 || assistantCount === 0) {
      this.responseCountBefore = 0;
      return;
    }

    const sidebar = page.locator(SELECTORS.newChat).first();
    if (await sidebar.count()) {
      await sidebar.click({ timeout: 8000, force: true }).catch(() => undefined);
      await page.waitForTimeout(1200);
      if ((await page.locator(SELECTORS.assistantMessage).count()) === 0) {
        this.responseCountBefore = 0;
        return;
      }
    }

    await page.goto(META_AI_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
    await this.composerInput(page).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    this.responseCountBefore = await page.locator(SELECTORS.assistantMessage).count();
  }

  private async typePrompt(page: Page, text: string): Promise<void> {
    if (!text.trim()) return;
    const input = this.composerInput(page);
    await input.waitFor({ state: 'visible', timeout: 15_000 });
    await input.click();
    await page.waitForTimeout(300);

    const ok = await page.evaluate(
      ({ selector, content }) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return false;
        el.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('delete', false, undefined);
        const dt = new DataTransfer();
        dt.setData('text/plain', content);
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        if (!el.dispatchEvent(pasteEvent)) {
          if (!document.execCommand('insertText', false, content)) {
            el.textContent = content;
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
        }
        return true;
      },
      { selector: SELECTORS.composerInput, content: text },
    );

    if (!ok) {
      await input.fill(text);
    }
    await page.waitForTimeout(400);
  }

  private async sendPrompt(page: Page): Promise<void> {
    this.responseCountBefore = await page.locator(SELECTORS.assistantMessage).count();
    const sendBtn = page.locator(SELECTORS.composerSend).first();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await sendBtn.isEnabled().catch(() => false)) {
        await sendBtn.click();
        await page.waitForTimeout(800);
        await this.autoScrollDown(page);
        return;
      }
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await this.autoScrollDown(page);
  }

  private async autoScrollDown(page: Page): Promise<void> {
    await page.evaluate(() => {
      const tryScroll = (el: Element | null) => {
        if (!el || !(el instanceof HTMLElement)) return;
        if (el.scrollHeight <= el.clientHeight + 50) return;
        const style = window.getComputedStyle(el);
        if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) return;
        el.scrollTop = el.scrollHeight;
      };
      document.querySelectorAll('[data-testid="assistant-message"], .markdown-content').forEach(tryScroll);
      const root = document.scrollingElement ?? document.documentElement;
      root.scrollTop = root.scrollHeight;
    }).catch(() => undefined);
  }

  private async getResponseStatus(page: Page, expectedIndex: number) {
    return page.evaluate(
      ({ expectedIndex, selectors }) => {
        const isVisible = (el: Element | null) => {
          if (!el || !(el instanceof HTMLElement)) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
          );
        };

        const assistants = Array.from(document.querySelectorAll(selectors.assistantMessage)).filter(
          isVisible,
        );
        const target = assistants[expectedIndex] ?? assistants[assistants.length - 1] ?? null;

        let bestText = '';
        if (target) {
          const markdownBlocks = Array.from(target.querySelectorAll(selectors.markdownContent));
          for (const block of markdownBlocks) {
            const text = (block.textContent ?? '').trim();
            if (text.length >= bestText.length) bestText = text;
          }
          if (!bestText) {
            bestText = (target.textContent ?? '').trim();
          }
        }

        const stopLike = Array.from(
          document.querySelectorAll(
            'button[aria-label*="Stop" i], [data-testid*="stop" i]',
          ),
        ).some(isVisible);

        return {
          newContentLength: bestText.length,
          newContent: bestText,
          hasStopSignal: stopLike,
          hasNewAssistant: assistants.length > expectedIndex,
        };
      },
      { expectedIndex, selectors: SELECTORS },
    );
  }

  private async waitForResponse(page: Page, timeoutMs: number): Promise<string> {
    const start = Date.now();
    const expectedIndex = this.responseCountBefore;
    let started = false;
    const startWaitSeconds = Math.min(90, Math.max(30, Math.floor(timeoutMs / 1000)));

    for (let wait = 0; wait < startWaitSeconds; wait += 1) {
      if (this.cancelled) {
        throw new AutomationError('GENERATION_ERROR', 'Meta AI generation cancelled');
      }
      await page.waitForTimeout(1000);
      if (wait > 0 && wait % 3 === 0) await this.autoScrollDown(page);
      const status = await this.getResponseStatus(page, expectedIndex);
      if (status.hasNewAssistant && status.newContentLength > 0) {
        started = true;
        break;
      }
    }

    if (!started) {
      const check = await this.getResponseStatus(page, expectedIndex);
      if (check.newContentLength === 0) {
        throw new AutomationError(
          'RESPONSE_TIMEOUT',
          `Meta AI không bắt đầu trả lời sau ${startWaitSeconds} giây.`,
        );
      }
    }

    let lastContent = '';
    let unchangedCount = 0;
    const settleSeconds = 6;

    while (Date.now() - start < timeoutMs) {
      if (this.cancelled) {
        throw new AutomationError('GENERATION_ERROR', 'Meta AI generation cancelled');
      }
      await page.waitForTimeout(1000);
      await this.autoScrollDown(page);
      const status = await this.getResponseStatus(page, expectedIndex);
      if (status.newContent === lastContent && status.newContentLength > 0 && !status.hasStopSignal) {
        unchangedCount += 1;
        if (unchangedCount >= settleSeconds) return status.newContent;
      } else {
        unchangedCount = 0;
      }
      lastContent = status.newContent || lastContent;
    }

    if (lastContent) return lastContent;
    throw new AutomationError('RESPONSE_TIMEOUT', 'Meta AI không phản hồi trong thời gian quy định.');
  }
}
