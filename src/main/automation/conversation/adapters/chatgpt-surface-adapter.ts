import type { Locator, Page } from 'playwright';
import type { BrowserConversationSurfaceAdapter } from '../surface-adapter';
import type { SendConfirmEvidence, TurnCounts } from '../lifecycle';
import {
  hashComposerText,
  normalizeComposerText,
  readComposerText,
} from '@shared/utils/notebook-composer-fill';
import { createHash } from 'node:crypto';

const SURFACE = 'chatgpt';

const COMPOSER_SELECTORS = [
  { key: 'prompt-textarea-id', sel: '#prompt-textarea' },
  { key: 'data-testid-prompt-textarea', sel: '[data-testid="prompt-textarea"]' },
  {
    key: 'composer-contenteditable',
    sel: '[data-testid="composer"] div[contenteditable="true"]',
  },
  { key: 'role-textbox', sel: 'div[contenteditable="true"][role="textbox"]' },
  { key: 'prosemirror', sel: '.ProseMirror[contenteditable="true"]' },
] as const;

const SEND_SELECTORS = [
  { key: 'send-button', sel: 'button[data-testid="send-button"]' },
  { key: 'composer-send', sel: 'button[data-testid="composer-send-button"]' },
  { key: 'aria-send-en', sel: 'button[aria-label="Send prompt"]' },
  { key: 'aria-send-vi', sel: 'button[aria-label="Gửi tin nhắn"]' },
] as const;

const USER_TURN_SELECTOR = '[data-message-author-role="user"]';
const ASSISTANT_TURN_SELECTOR = '[data-message-author-role="assistant"]';
const ASSISTANT_TEXT_SELECTOR = '[data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"]';

const GENERATING_SELECTORS = [
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
  '.result-streaming',
];

function shortHash(text: string): string {
  return createHash('sha256').update(normalizeComposerText(text), 'utf8').digest('hex').slice(0, 16);
}

export class ChatGptSurfaceAdapter implements BrowserConversationSurfaceAdapter {
  readonly providerId = 'prov-playwright-chatgpt';
  readonly surfaceName = SURFACE;

  private page: Page | null = null;
  private composer: Locator | null = null;
  private composerSelectorKey: string | null = null;

  attach(page: Page): void {
    this.page = page;
    this.composer = null;
    this.composerSelectorKey = null;
  }

  private requirePage(): Page {
    if (!this.page) throw new Error('ChatGPT surface: page not attached');
    return this.page;
  }

  async detectSurface(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const page = this.requirePage();
    const found = await this.findComposer();
    if (!found.ok) return found;
    const login = page.locator('button:has-text("Log in"), a:has-text("Log in")');
    if (await login.first().isVisible().catch(() => false)) {
      return { ok: false, reason: 'Login screen visible' };
    }
    return { ok: true };
  }

  async findComposer(): Promise<{ ok: true; selector: string } | { ok: false; reason: string }> {
    const page = this.requirePage();
    for (const { key, sel } of COMPOSER_SELECTORS) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
        this.composer = loc;
        this.composerSelectorKey = key;
        return { ok: true, selector: sel };
      }
    }
    return { ok: false, reason: 'ChatGPT composer not found' };
  }

  private requireComposer(): Locator {
    if (!this.composer) throw new Error('ChatGPT composer not resolved');
    return this.composer;
  }

  async fillComposer(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const page = this.requirePage();
    const input = this.requireComposer();
    await input.click();
    await page.waitForTimeout(100);
    const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'textarea') {
      await input.fill(text);
    } else {
      await page.keyboard.press('Control+A').catch(() => undefined);
      await page.keyboard.press('Backspace').catch(() => undefined);
      await page.keyboard.insertText(text);
    }
    await page.waitForTimeout(150);
    return { ok: true };
  }

  async readComposerText(): Promise<string> {
    return readComposerText(this.requireComposer());
  }

  async readComposerHash(): Promise<string> {
    return hashComposerText(await this.readComposerText());
  }

  async clickSend(): Promise<
    { ok: true; method: 'button' | 'enter' } | { ok: false; reason: string }
  > {
    const page = this.requirePage();
    for (const { sel } of SEND_SELECTORS) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false) && (await btn.isEnabled().catch(() => false))) {
        await btn.click();
        return { ok: true, method: 'button' };
      }
    }
    await page.keyboard.press('Enter');
    return { ok: true, method: 'enter' };
  }

  async detectSendConfirmation(
    before: TurnCounts,
    marker: string,
  ): Promise<SendConfirmEvidence | null> {
    const page = this.requirePage();
    const composerText = normalizeComposerText(await this.readComposerText()).trim();
    if (!composerText || !composerText.includes(marker)) {
      return 'composer_cleared';
    }

    const userCount = await this.countUserTurns();
    if (userCount > before.userTurns) {
      const idx = await this.findUserTurnIndexByMarker(marker);
      if (idx >= 0) return 'user_turn_with_marker';
      return 'user_turn_count_increased';
    }

    if (await this.isGenerating()) {
      return 'generating_control_visible';
    }

    const assistantCount = await this.countAssistantTurns();
    if (assistantCount > before.assistantTurns) {
      return 'new_assistant_turn';
    }

    // Marker appeared in existing user bubble
    const idx = await this.findUserTurnIndexByMarker(marker);
    if (idx >= 0) return 'user_turn_with_marker';

    void page;
    return null;
  }

  async countUserTurns(): Promise<number> {
    return this.requirePage().locator(USER_TURN_SELECTOR).count();
  }

  async countAssistantTurns(): Promise<number> {
    return this.requirePage().locator(ASSISTANT_TURN_SELECTOR).count();
  }

  async findUserTurnIndexByMarker(marker: string): Promise<number> {
    const page = this.requirePage();
    const users = page.locator(USER_TURN_SELECTOR);
    const count = await users.count();
    for (let i = 0; i < count; i += 1) {
      const text = (await users.nth(i).innerText().catch(() => '')).trim();
      if (text.includes(marker)) return i;
    }
    return -1;
  }

  async findAssistantIndexForUserTurn(userTurnIndex: number): Promise<number> {
    // ChatGPT interleaves user/assistant turns — assistant index aligns with user index in practice.
    const assistantCount = await this.countAssistantTurns();
    if (userTurnIndex < 0) return -1;
    const expected = userTurnIndex;
    if (expected < assistantCount) return expected;
    if (assistantCount > 0 && userTurnIndex === await this.countUserTurns() - 1) {
      return assistantCount - 1;
    }
    return -1;
  }

  async readAssistantText(assistantIndex: number): Promise<string> {
    const page = this.requirePage();
    const loc = page.locator(ASSISTANT_TEXT_SELECTOR).nth(assistantIndex);
    return (await loc.innerText().catch(() => '')).trim();
  }

  async isGenerating(): Promise<boolean> {
    const page = this.requirePage();
    for (const sel of GENERATING_SELECTORS) {
      if (await page.locator(sel).first().isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  async hashAssistantText(assistantIndex: number): Promise<string | null> {
    const text = await this.readAssistantText(assistantIndex);
    return text ? shortHash(text) : null;
  }

  async cancelGeneration(): Promise<void> {
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

  async detectLoginRequired(): Promise<boolean> {
    const page = this.requirePage();
    const login = page.locator(
      'button:has-text("Log in"), a:has-text("Log in"), button:has-text("Đăng nhập")',
    );
    return login.first().isVisible().catch(() => false);
  }

  async detectRateLimit(): Promise<boolean> {
    const body = (await this.requirePage().locator('body').innerText().catch(() => '')).toLowerCase();
    return /rate limit|too many requests|quota/.test(body);
  }

  async detectBlockedOrSecurityChallenge(): Promise<boolean> {
    const body = (await this.requirePage().locator('body').innerText().catch(() => '')).toLowerCase();
    return /captcha|verify you are human|unusual traffic|security check/.test(body);
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      composerSelectorKey: this.composerSelectorKey,
      surface: SURFACE,
    };
  }
}
