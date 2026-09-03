import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Page } from 'playwright';
import { BrowserConversationHarness } from '@main/automation/conversation/browser-conversation-harness';
import type { BrowserConversationSurfaceAdapter } from '@main/automation/conversation/surface-adapter';
import type { SendConfirmEvidence, TurnCounts } from '@main/automation/conversation/lifecycle';
import { AutomationError } from '@main/automation/errors/automation-errors';
import { ChatGptSurfaceAdapter } from '@main/automation/conversation/adapters/chatgpt-surface-adapter';
import { MetaAiSurfaceAdapter } from '@main/automation/conversation/adapters/meta-ai-surface-adapter';
import { startFixtureServer } from '../automation/fixture-server';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/conversation');

type Scenario =
  | 'success'
  | 'send_noop'
  | 'login'
  | 'captcha'
  | 'streaming';

class MockSurfaceAdapter implements BrowserConversationSurfaceAdapter {
  readonly providerId = 'mock-provider';
  readonly surfaceName = 'mock';

  scenario: Scenario = 'success';
  composerText = '';
  userTurns = 0;
  assistantTurns = 0;
  assistantTexts: string[] = [];
  generating = false;
  sendClicked = false;
  markerInComposer = false;

  attach(_page: Page): void {
    void _page;
  }

  detectSurface(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.scenario === 'login') return Promise.resolve({ ok: false, reason: 'login' });
    return Promise.resolve({ ok: true });
  }

  findComposer(): Promise<{ ok: true; selector: string } | { ok: false; reason: string }> {
    return Promise.resolve({ ok: true, selector: '#composer' });
  }

  fillComposer(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    this.composerText = text;
    this.markerInComposer = text.includes('NTS_REQUEST_REF:');
    return Promise.resolve({ ok: true });
  }

  readComposerText(): Promise<string> {
    return Promise.resolve(this.composerText);
  }

  readComposerHash(): Promise<string> {
    return Promise.resolve('mock-hash');
  }

  clickSend(): Promise<{ ok: true; method: 'button' | 'enter' } | { ok: false; reason: string }> {
    this.sendClicked = true;
    if (this.scenario === 'send_noop') {
      return Promise.resolve({ ok: true, method: 'button' });
    }
    this.composerText = '';
    this.markerInComposer = false;
    this.userTurns += 1;
    this.generating = true;
    if (this.scenario === 'success' || this.scenario === 'streaming') {
      this.assistantTurns += 1;
      this.assistantTexts.push('');
    }
    return Promise.resolve({ ok: true, method: 'button' });
  }

  detectSendConfirmation(before: TurnCounts, marker: string): Promise<SendConfirmEvidence | null> {
    if (this.scenario === 'send_noop') return Promise.resolve(null);
    if (!this.composerText.includes(marker)) return Promise.resolve('composer_cleared');
    if (this.userTurns > before.userTurns) return Promise.resolve('user_turn_with_marker');
    if (this.generating) return Promise.resolve('generating_control_visible');
    return Promise.resolve(null);
  }

  countUserTurns(): Promise<number> {
    return Promise.resolve(this.userTurns);
  }

  countAssistantTurns(): Promise<number> {
    return Promise.resolve(this.assistantTurns);
  }

  findUserTurnIndexByMarker(_marker: string): Promise<number> {
    return Promise.resolve(
      this.markerInComposer || this.scenario !== 'send_noop' ? this.userTurns - 1 : -1,
    );
  }

  findAssistantIndexForUserTurn(userTurnIndex: number): Promise<number> {
    if (userTurnIndex < 0) return Promise.resolve(-1);
    if (userTurnIndex < this.assistantTexts.length) return Promise.resolve(userTurnIndex);
    return Promise.resolve(-1);
  }

  readAssistantText(assistantIndex: number): Promise<string> {
    return Promise.resolve(this.assistantTexts[assistantIndex] ?? '');
  }

  isGenerating(): Promise<boolean> {
    return Promise.resolve(this.generating);
  }

  hashAssistantText(assistantIndex: number): Promise<string | null> {
    const t = this.assistantTexts[assistantIndex];
    return Promise.resolve(t ? `hash-${t}` : null);
  }

  cancelGeneration(): Promise<void> {
    this.generating = false;
    return Promise.resolve();
  }

  detectLoginRequired(): Promise<boolean> {
    return Promise.resolve(this.scenario === 'login');
  }

  detectCaptchaRequired(): Promise<boolean> {
    return Promise.resolve(this.scenario === 'captcha');
  }

  detectRateLimit(): Promise<boolean> {
    return Promise.resolve(false);
  }

  detectBlockedOrSecurityChallenge(): Promise<boolean> {
    return Promise.resolve(false);
  }

  getDiagnostics(): Record<string, unknown> {
    return { scenario: this.scenario };
  }

  /** Test helper — simulate streaming completion */
  finishStreaming(text: string): void {
    const idx = this.assistantTexts.length - 1;
    if (idx >= 0) this.assistantTexts[idx] = text;
    this.generating = false;
  }
}

describe('BrowserConversationHarness (mock adapter)', () => {
  let browser: import('playwright').Browser;
  let page: Page;

  beforeAll(async () => {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    await page.close();
  });

  it('returns new response after confirmed send', async () => {
    const adapter = new MockSurfaceAdapter();
    adapter.assistantTexts = ['OLD'];
    adapter.assistantTurns = 1;

    const harness = new BrowserConversationHarness();
    const runPromise = harness.run({
      page,
      adapter,
      prompt: 'Translate paragraph one.',
      timeouts: {
        sendConfirmMs: 2000,
        generationStartMs: 3000,
        streamingMs: 5000,
        stabilizationMs: 5000,
        stabilizationQuietMs: 200,
        stabilizationPollMs: 100,
      },
    });

    await new Promise((r) => setTimeout(r, 50));
    adapter.finishStreaming('Fresh assistant output.');

    const result = await runPromise;
    expect(result.text).toBe('Fresh assistant output.');
    expect(result.sendEvidence).toBeTruthy();
  });

  it('CRITICAL: never returns stale assistant when send is not confirmed', async () => {
    const adapter = new MockSurfaceAdapter();
    adapter.scenario = 'send_noop';
    adapter.assistantTexts = ['OLD STALE ASSISTANT TEXT MUST NOT RETURN'];
    adapter.assistantTurns = 1;

    const harness = new BrowserConversationHarness();
    await expect(
      harness.run({
        page,
        adapter,
        prompt: 'Request that never sends.',
        timeouts: {
          sendConfirmMs: 400,
          generationStartMs: 400,
          streamingMs: 400,
          stabilizationMs: 400,
          stabilizationPollMs: 80,
        },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AutomationError);
      const ae = err as AutomationError;
      expect(['SEND_NOT_CONFIRMED', 'RESPONSE_NOT_FOUND']).toContain(ae.code);
      return true;
    });
  });

  it('throws CAPTCHA_REQUIRED and never bypasses', async () => {
    const adapter = new MockSurfaceAdapter();
    adapter.scenario = 'captcha';

    const harness = new BrowserConversationHarness();
    await expect(
      harness.run({ page, adapter, prompt: 'hello' }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AutomationError);
      expect((err as AutomationError).code).toBe('CAPTCHA');
      return true;
    });
  });

  it('throws LOGIN_REQUIRED when adapter detects login', async () => {
    const adapter = new MockSurfaceAdapter();
    adapter.scenario = 'login';

    const harness = new BrowserConversationHarness();
    await expect(
      harness.run({ page, adapter, prompt: 'hello' }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AutomationError);
      expect((err as AutomationError).code).toBe('LOGIN_REQUIRED');
      return true;
    });
  });
});

describe('BrowserConversationHarness (fixture DOM)', () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let browser: import('playwright').Browser;
  let page: Page;

  beforeAll(async () => {
    const server = await startFixtureServer(FIXTURE_DIR);
    baseUrl = server.baseUrl;
    closeServer = server.close;
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
    await closeServer();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    await page.close();
  });

  it('ChatGPT fixture: send → confirm → capture new response', async () => {
    await page.goto(`${baseUrl}/chatgpt-send-ok.html`);
    const harness = new BrowserConversationHarness();
    const adapter = new ChatGptSurfaceAdapter();

    const result = await harness.run({
      page,
      adapter,
      prompt: 'Synthetic paragraph for ChatGPT harness test.',
      timeouts: {
        sendConfirmMs: 5000,
        generationStartMs: 8000,
        streamingMs: 15_000,
        stabilizationMs: 15_000,
        stabilizationQuietMs: 300,
        stabilizationPollMs: 150,
      },
    });

    expect(result.text).toContain('Synthetic ChatGPT response');
    expect(result.sendEvidence).toBeTruthy();
  });

  it('ChatGPT fixture: stale assistant blocked when send disabled', async () => {
    await page.goto(`${baseUrl}/chatgpt-stale-response.html`);
    const harness = new BrowserConversationHarness();
    const adapter = new ChatGptSurfaceAdapter();

    await expect(
      harness.run({
        page,
        adapter,
        prompt: 'Prompt with no send path.',
        timeouts: {
          sendConfirmMs: 800,
          generationStartMs: 800,
          streamingMs: 800,
          stabilizationMs: 800,
          stabilizationPollMs: 100,
        },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AutomationError);
      const code = (err as AutomationError).code;
      expect(['SEND_NOT_CONFIRMED', 'SEND_DISABLED', 'RESPONSE_NOT_FOUND', 'COMPOSER_FILL_FAILED']).toContain(code);
      return true;
    });
  });

  it('Meta fixture: send → confirm → capture new response', async () => {
    await page.goto(`${baseUrl}/meta-send-ok.html`);
    const harness = new BrowserConversationHarness();
    const adapter = new MetaAiSurfaceAdapter();

    const result = await harness.run({
      page,
      adapter,
      prompt: 'Synthetic paragraph for Meta harness test.',
      timeouts: {
        sendConfirmMs: 5000,
        generationStartMs: 8000,
        streamingMs: 15_000,
        stabilizationMs: 15_000,
        stabilizationQuietMs: 300,
        stabilizationPollMs: 150,
      },
    });

    expect(result.text).toContain('Synthetic Meta AI response');
    expect(result.sendEvidence).toBeTruthy();
  });

  it('Meta fixture: stale assistant blocked when send disabled', async () => {
    await page.goto(`${baseUrl}/meta-stale-response.html`);
    const harness = new BrowserConversationHarness();
    const adapter = new MetaAiSurfaceAdapter();

    await expect(
      harness.run({
        page,
        adapter,
        prompt: 'Meta prompt cannot send.',
        timeouts: {
          sendConfirmMs: 800,
          generationStartMs: 800,
          streamingMs: 800,
          stabilizationMs: 800,
          stabilizationPollMs: 100,
        },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AutomationError);
      const code = (err as AutomationError).code;
      expect(['SEND_NOT_CONFIRMED', 'SEND_DISABLED', 'RESPONSE_NOT_FOUND', 'COMPOSER_FILL_FAILED']).toContain(code);
      return true;
    });
  });
});
