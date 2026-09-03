import type { Locator, Page } from 'playwright';
import type { BrowserConversationSurfaceAdapter } from '../surface-adapter';
import type { SendConfirmEvidence, TurnCounts } from '../lifecycle';
import {
  hashComposerText,
  normalizeComposerText,
  readComposerText,
  setAngularComposerValue,
} from '@shared/utils/notebook-composer-fill';
import { createHash } from 'node:crypto';

const SURFACE = 'meta-ai';

const SELECTORS = {
  composerInput: '[data-testid="composer-input"][contenteditable="true"]',
  composerSend: '[data-testid="composer-send-button"]',
  userTurn: '[data-testid="user-message"]',
  assistantTurn: '[data-testid="assistant-message"]',
  markdown: '.markdown-content',
  stop: 'button[aria-label*="Stop" i], [data-testid*="stop" i]',
} as const;

function shortHash(text: string): string {
  return createHash('sha256').update(normalizeComposerText(text), 'utf8').digest('hex').slice(0, 16);
}

export class MetaAiSurfaceAdapter implements BrowserConversationSurfaceAdapter {
  readonly providerId = 'prov-playwright-meta-ai';
  readonly surfaceName = SURFACE;

  private page: Page | null = null;
  private composer: Locator | null = null;

  attach(page: Page): void {
    this.page = page;
    this.composer = null;
  }

  private requirePage(): Page {
    if (!this.page) throw new Error('Meta AI surface: page not attached');
    return this.page;
  }

  private composerLocator(page: Page): Locator {
    return page.locator(SELECTORS.composerInput).last();
  }

  async detectSurface(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const found = await this.findComposer();
    if (!found.ok) return found;
    if (await this.detectLoginRequired()) {
      return { ok: false, reason: 'Login required' };
    }
    return { ok: true };
  }

  async findComposer(): Promise<{ ok: true; selector: string } | { ok: false; reason: string }> {
    const page = this.requirePage();
    const loc = this.composerLocator(page);
    if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) {
      this.composer = loc;
      return { ok: true, selector: SELECTORS.composerInput };
    }
    return { ok: false, reason: 'Meta AI composer not found' };
  }

  private requireComposer(): Locator {
    if (!this.composer) throw new Error('Meta composer not resolved');
    return this.composer;
  }

  async fillComposer(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const page = this.requirePage();
    const input = this.requireComposer();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.click();
    await page.waitForTimeout(200);

    try {
      await setAngularComposerValue(input, text);
    } catch {
      try {
        await input.fill(text);
      } catch {
        try {
          await input.click();
          await page.keyboard.insertText(text);
        } catch {
          return { ok: false, reason: 'Meta composer fill failed' };
        }
      }
    }

    await page.waitForTimeout(200);
    const readBack = normalizeComposerText(await this.readComposerText());
    const intended = normalizeComposerText(text);
    if (!readBack.includes(intended.slice(0, Math.min(32, intended.length)))) {
      return { ok: false, reason: 'Meta composer text verification failed after fill' };
    }
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
    const sendBtn = page.locator(SELECTORS.composerSend).first();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await sendBtn.isEnabled().catch(() => false)) {
        await sendBtn.click();
        return { ok: true, method: 'button' };
      }
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Enter');
    return { ok: true, method: 'enter' };
  }

  async detectSendConfirmation(
    before: TurnCounts,
    marker: string,
  ): Promise<SendConfirmEvidence | null> {
    const composerText = normalizeComposerText(await this.readComposerText()).trim();
    if (!composerText.includes(marker) || composerText.length < 16) {
      return 'composer_cleared';
    }

    const userCount = await this.countUserTurns();
    if (userCount > before.userTurns) {
      const idx = await this.findUserTurnIndexByMarker(marker);
      if (idx >= 0) return 'user_turn_with_marker';
      return 'user_turn_count_increased';
    }

    if (await this.isGenerating()) return 'generating_control_visible';

    const assistantCount = await this.countAssistantTurns();
    if (assistantCount > before.assistantTurns) return 'new_assistant_turn';

    if (await this.findUserTurnIndexByMarker(marker) >= 0) {
      return 'user_turn_with_marker';
    }

    return null;
  }

  async countUserTurns(): Promise<number> {
    return this.requirePage().locator(SELECTORS.userTurn).count();
  }

  async countAssistantTurns(): Promise<number> {
    return this.requirePage().locator(SELECTORS.assistantTurn).count();
  }

  async findUserTurnIndexByMarker(marker: string): Promise<number> {
    const page = this.requirePage();
    const users = page.locator(SELECTORS.userTurn);
    const count = await users.count();
    for (let i = 0; i < count; i += 1) {
      const text = (await users.nth(i).innerText().catch(() => '')).trim();
      if (text.includes(marker)) return i;
    }
    return -1;
  }

  async findAssistantIndexForUserTurn(userTurnIndex: number): Promise<number> {
    if (userTurnIndex < 0) return -1;
    const assistantCount = await this.countAssistantTurns();
    if (userTurnIndex < assistantCount) return userTurnIndex;
    return -1;
  }

  async readAssistantText(assistantIndex: number): Promise<string> {
    const page = this.requirePage();
    const turn = page.locator(SELECTORS.assistantTurn).nth(assistantIndex);
    const markdown = turn.locator(SELECTORS.markdown);
    if (await markdown.count()) {
      let best = '';
      const n = await markdown.count();
      for (let i = 0; i < n; i += 1) {
        const t = (await markdown.nth(i).innerText().catch(() => '')).trim();
        if (t.length > best.length) best = t;
      }
      if (best) return best;
    }
    return (await turn.innerText().catch(() => '')).trim();
  }

  async isGenerating(): Promise<boolean> {
    return this.requirePage().locator(SELECTORS.stop).first().isVisible().catch(() => false);
  }

  async hashAssistantText(assistantIndex: number): Promise<string | null> {
    const text = await this.readAssistantText(assistantIndex);
    return text ? shortHash(text) : null;
  }

  async cancelGeneration(): Promise<void> {
    const page = this.page;
    if (!page) return;
    const stop = page.locator(SELECTORS.stop).first();
    if (await stop.isVisible().catch(() => false)) {
      await stop.click({ timeout: 2000 }).catch(() => undefined);
    }
  }

  async detectLoginRequired(): Promise<boolean> {
    const page = this.requirePage();
    const login = page.locator(
      'button:has-text("Đăng nhập"), a:has-text("Đăng nhập"), button:has-text("Log in")',
    );
    return login.first().isVisible().catch(() => false);
  }

  async detectRateLimit(): Promise<boolean> {
    const body = (await this.requirePage().locator('body').innerText().catch(() => '')).toLowerCase();
    return /rate limit|too many|slow down/.test(body);
  }

  async detectCaptchaRequired(): Promise<boolean> {
    const page = this.requirePage();
    const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    if (/captcha|verify you are human|i'm not a robot/.test(body)) return true;
    return page
      .locator('[data-testid="captcha"], iframe[src*="recaptcha"]')
      .first()
      .isVisible()
      .catch(() => false);
  }

  async detectBlockedOrSecurityChallenge(): Promise<boolean> {
    if (await this.detectCaptchaRequired()) return false;
    const body = (await this.requirePage().locator('body').innerText().catch(() => '')).toLowerCase();
    return /security|blocked|access denied/.test(body);
  }

  getDiagnostics(): Record<string, unknown> {
    return { surface: SURFACE, composerSelector: SELECTORS.composerInput };
  }
}
