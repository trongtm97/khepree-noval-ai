import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Locator, Page } from 'playwright';
import type { BrowserConversationSurfaceAdapter } from '../surface-adapter';
import type { SendConfirmEvidence, TurnCounts } from '../lifecycle';
import {
  hashComposerText,
  normalizeComposerText,
  readComposerText,
} from '@shared/utils/notebook-composer-fill';
import { GeminiSelectorRegistry } from '../../providers/google/selectors/google-gemini.selectors';
import {
  captureConversationSnapshot,
  detectSendConfirmation as detectGeminiSendConfirmation,
  userMessageLocators,
} from '../../providers/google/conversation-snapshot';

const SURFACE = 'gemini';

function shortHash(text: string): string {
  return createHash('sha256').update(normalizeComposerText(text), 'utf8').digest('hex').slice(0, 16);
}

function mapGeminiEvidence(
  evidence:
    | 'composer_cleared'
    | 'user_message_with_marker'
    | 'turn_count_increased'
    | 'stop_generating_visible'
    | 'new_assistant_response'
    | null,
): SendConfirmEvidence | null {
  if (!evidence) return null;
  switch (evidence) {
    case 'composer_cleared':
      return 'composer_cleared';
    case 'user_message_with_marker':
      return 'user_turn_with_marker';
    case 'turn_count_increased':
      return 'user_turn_count_increased';
    case 'stop_generating_visible':
      return 'generating_control_visible';
    case 'new_assistant_response':
      return 'new_assistant_turn';
    default:
      return null;
  }
}

/** Gemini / NotebookLM surface — reuses mature selector registry + send confirmation. */
export class GeminiSurfaceAdapter implements BrowserConversationSurfaceAdapter {
  readonly providerId = 'prov-playwright-gemini';
  readonly surfaceName = SURFACE;

  private page: Page | null = null;
  private registry: GeminiSelectorRegistry | null = null;
  private composer: Locator | null = null;
  private composerSelectorKey = 'promptInput';

  constructor(private readonly diagnosticsDir: string = path.join(os.tmpdir(), 'nts-gemini-harness')) {}

  attach(page: Page): void {
    this.page = page;
    this.registry = new GeminiSelectorRegistry(page, this.diagnosticsDir);
    this.composer = null;
  }

  private requirePage(): Page {
    if (!this.page) throw new Error('Gemini surface: page not attached');
    return this.page;
  }

  private requireRegistry(): GeminiSelectorRegistry {
    if (!this.registry) throw new Error('Gemini registry not attached');
    return this.registry;
  }

  async detectSurface(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const registry = this.requireRegistry();
    const surface = await registry.ensureSurface();
    if (surface === 'GOOGLE_LOGIN') {
      return { ok: false, reason: 'Google login surface' };
    }
    if (surface === 'UNKNOWN') {
      return { ok: false, reason: 'Unknown Gemini surface' };
    }
    const composer = await this.findComposer();
    return composer.ok ? { ok: true } : composer;
  }

  async findComposer(): Promise<{ ok: true; selector: string } | { ok: false; reason: string }> {
    const registry = this.requireRegistry();
    try {
      this.composer = await registry.resolve('promptInput', { timeoutMs: 12_000, editable: true });
      return { ok: true, selector: this.composerSelectorKey };
    } catch {
      return { ok: false, reason: 'Gemini composer not found' };
    }
  }

  private requireComposer(): Locator {
    if (!this.composer) throw new Error('Gemini composer not resolved');
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
    const registry = this.requireRegistry();
    try {
      const send = await registry.resolve('sendButton', { timeoutMs: 8_000 });
      if (!(await send.isEnabled().catch(() => false))) {
        return { ok: false, reason: 'Gemini send button disabled' };
      }
      await send.click();
      return { ok: true, method: 'button' };
    } catch {
      return { ok: false, reason: 'Gemini send button not found' };
    }
  }

  async detectSendConfirmation(
    before: TurnCounts,
    marker: string,
  ): Promise<SendConfirmEvidence | null> {
    const page = this.requirePage();
    const registry = this.requireRegistry();
    const composer = this.requireComposer();
    const composerText = await this.readComposerText();
    const snapshotBefore = await captureConversationSnapshot({
      page,
      composer,
      assistantResponses: registry.assistantResponses(),
      correlationMarker: marker,
      composerText: '', // length comparison uses before counts below
    });
    snapshotBefore.userMessageCount = before.userTurns;
    snapshotBefore.assistantMessageCount = before.assistantTurns;

    const evidence = await detectGeminiSendConfirmation({
      page,
      composer,
      assistantResponses: registry.assistantResponses(),
      before: {
        ...snapshotBefore,
        composerLength: normalizeComposerText(composerText).length || 999,
        composerHash: hashComposerText(composerText),
      },
      correlationMarker: marker,
      readComposerText: () => this.readComposerText(),
    });
    return mapGeminiEvidence(evidence);
  }

  async countUserTurns(): Promise<number> {
    return userMessageLocators(this.requirePage()).count();
  }

  async countAssistantTurns(): Promise<number> {
    return this.requireRegistry().assistantResponses().count();
  }

  async findUserTurnIndexByMarker(marker: string): Promise<number> {
    const users = userMessageLocators(this.requirePage());
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
    return assistantCount > userTurnIndex ? userTurnIndex : -1;
  }

  async readAssistantText(assistantIndex: number): Promise<string> {
    const loc = this.requireRegistry().assistantResponses().nth(assistantIndex);
    return (await loc.innerText().catch(() => '')).trim();
  }

  async isGenerating(): Promise<boolean> {
    const registry = this.requireRegistry();
    if (await registry.isAnyResponseStreaming()) return true;
    if (await registry.isStreamingVisible()) return true;
    return false;
  }

  async hashAssistantText(assistantIndex: number): Promise<string | null> {
    const text = await this.readAssistantText(assistantIndex);
    return text ? shortHash(text) : null;
  }

  async cancelGeneration(): Promise<void> {
    const registry = this.registry;
    if (!registry) return;
    const stop = await registry.tryResolve('stopButton', { timeoutMs: 1500 });
    if (stop && (await stop.isVisible().catch(() => false))) {
      await stop.click({ timeout: 2000 }).catch(() => undefined);
    }
  }

  async detectLoginRequired(): Promise<boolean> {
    const registry = this.requireRegistry();
    const surface = registry.getSurface();
    if (surface === 'GOOGLE_LOGIN') return true;
    const page = this.requirePage();
    const login = page.locator('input[type="email"], button:has-text("Sign in")');
    return login.first().isVisible().catch(() => false);
  }

  async detectRateLimit(): Promise<boolean> {
    const body = (await this.requirePage().locator('body').innerText().catch(() => '')).toLowerCase();
    return /quota|rate limit|too many requests/.test(body);
  }

  async detectBlockedOrSecurityChallenge(): Promise<boolean> {
    const body = (await this.requirePage().locator('body').innerText().catch(() => '')).toLowerCase();
    return /captcha|unusual traffic|verify/.test(body);
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      surface: this.registry?.getSurface() ?? SURFACE,
      composerSelectorKey: this.composerSelectorKey,
    };
  }
}
