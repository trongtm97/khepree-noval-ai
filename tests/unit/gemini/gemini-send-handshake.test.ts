import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { GeminiBrowserProvider } from '@main/automation/providers/google/gemini-browser-provider';
import { BrowserEventLogger } from '@main/automation/browser-event-logger';
import {
  hashComposerText,
  verifyComposerPayload,
} from '@shared/utils/notebook-composer-fill';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/gemini');

function minimalPack(prompt: string): TranslationPackDto {
  return {
    projectId: '00000000-0000-4000-8000-000000000010',
    chapterIds: ['00000000-0000-4000-8000-000000000011'],
    chapterNumbers: [1],
    style: 'balanced',
    prompt,
    sections: {
      taskHeader: 'task',
      criticalRules: 'rules',
      hotMemoryDelta: 'memory',
      activeProjectTerms: 'terms',
      sourceParagraphs: 'source',
      outputProtocol: 'protocol',
    },
    size: {
      sourceChars: 10,
      contextChars: 10,
      totalChars: 20,
      estimatedTokens: 5,
      activeTermCount: 0,
      activeCharacterCount: 0,
      relationshipCount: 0,
      recentMemoryCount: 0,
      paragraphCount: 1,
      chapterCount: 1,
    },
    promptHash: 'abc',
  };
}

describe('composer fill verification (pure)', () => {
  it('accepts exact payload', () => {
    expect(verifyComposerPayload('hello world', 'hello world')).toBe('ok');
    expect(hashComposerText('a')).toHaveLength(16);
  });

  it('detects truncation', () => {
    const full = 'A'.repeat(100) + 'TAIL_MARKER_SUFFIX_VALUE_HERE';
    const truncated = full.slice(0, 50);
    expect(verifyComposerPayload(full, truncated)).toBe('truncated');
  });

  it('flags mismatch when prefix differs', () => {
    expect(verifyComposerPayload('alpha beta gamma', 'zzzz beta gamma')).toBe('mismatch');
  });
});

describe('GeminiBrowserProvider send handshake', () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let tempRoot: string;
  let browser: import('playwright').Browser;
  let context: import('playwright').BrowserContext;
  let page: import('playwright').Page;

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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-send-'));
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function provider(
    extras?: Partial<ConstructorParameters<typeof GeminiBrowserProvider>[0]>,
  ): GeminiBrowserProvider {
    const eventLogger = new BrowserEventLogger(null, path.join(tempRoot, 'events'));
    const p = new GeminiBrowserProvider({
      diagnosticsDir: path.join(tempRoot, 'diag'),
      baseUrl: `${baseUrl}/chat-ready.html`,
      eventLogger,
      maxTimeoutMs: 20_000,
      stabilizationWindowMs: 600,
      noIndicatorStabilizationWindowMs: 600,
      sendConfirmTimeoutMs: 3_000,
      sendButtonWaitMs: 2_500,
      ...extras,
    });
    p.attachPage(page);
    return p;
  }

  function eventTypes(): string[] {
    const file = path.join(tempRoot, 'events', 'browser-events.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { eventType: string }).eventType);
  }

  it('send success confirms before generation wait', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const p = provider();
    const correlationId = '00000000-0000-4000-8000-000000000099';
    await p.submitTranslationPack(minimalPack('Translate ok'), correlationId);
    const types = eventTypes();
    expect(types).toContain('COMPOSER_READY');
    expect(types).toContain('PROMPT_FILLED');
    expect(types).toContain('SEND_CLICKED');
    expect(types).toContain('SEND_CONFIRMED');
    expect(types).not.toContain('SEND_NOT_CONFIRMED');
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(correlationId);
    const raw = await p.extractLatestResponse(correlationId);
    expect(raw.text).toContain('<TRANSLATION>');
  }, 25_000);

  it('submitPlainPrompt uses the same send handshake', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const p = provider();
    const correlationId = '00000000-0000-4000-8000-000000000077';
    await p.submitPlainPrompt('Analyze this novel', correlationId);
    expect(eventTypes()).toContain('SEND_CONFIRMED');
  }, 20_000);

  it('send disabled throws without waiting for generation', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=send-disabled`);
    const p = provider({ sendButtonWaitMs: 1_500 });
    await expect(p.submitPlainPrompt('Cannot send')).rejects.toMatchObject({
      code: expect.stringMatching(/SEND_DISABLED|UNKNOWN_UI|SELECTOR_NOT_FOUND/),
    });
    expect(eventTypes()).not.toContain('SEND_CONFIRMED');
    expect(eventTypes()).not.toContain('generation_started');
  }, 20_000);

  it('Enter alone only inserts newline — does not confirm send', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const p = provider();
    await p.createOrOpenTranslationThread();
    const input = page.getByTestId('prompt-input');
    await input.fill('line1');
    await input.press('Enter');
    const value = await input.inputValue();
    expect(value).toContain('\n');
    expect(await page.getByTestId('user-message').count()).toBe(0);
    // Actual send via button still works afterward through provider.
    await p.submitPlainPrompt('after newline');
    expect(eventTypes()).toContain('SEND_CONFIRMED');
  }, 25_000);

  it('click with no effect throws SEND_NOT_CONFIRMED', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=click-noop`);
    const p = provider({ sendConfirmTimeoutMs: 1_500 });
    await expect(p.submitPlainPrompt('noop')).rejects.toMatchObject({
      code: 'SEND_NOT_CONFIRMED',
    });
    expect(eventTypes()).toContain('SEND_NOT_CONFIRMED');
    expect(eventTypes()).not.toContain('generation_started');
  }, 30_000);

  it('composer truncate raises PROMPT_TOO_LARGE', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=truncate`);
    const p = provider();
    const longPrompt = `PREFIX_${'X'.repeat(200)}_SUFFIX_END`;
    await expect(p.submitPlainPrompt(longPrompt)).rejects.toMatchObject({
      code: 'PROMPT_TOO_LARGE',
    });
  }, 20_000);

  it('slow user message still confirms send', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=slow-user`);
    const p = provider({ sendConfirmTimeoutMs: 5_000 });
    await p.submitPlainPrompt('slow confirm');
    expect(eventTypes()).toContain('SEND_CONFIRMED');
  }, 25_000);

  it('double-submit while in-flight is refused', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=slow-user`);
    const p = provider({ sendConfirmTimeoutMs: 5_000 });
    const first = p.submitPlainPrompt('first');
    await page.waitForTimeout(50);
    await expect(p.submitPlainPrompt('second')).rejects.toMatchObject({
      code: 'SEND_NOT_CONFIRMED',
    });
    await first;
  }, 25_000);

  it('does not use Enter as silent send fallback when button missing', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    await page.evaluate(() => {
      document.querySelector('[data-testid="send-prompt"]')?.remove();
    });
    const p = provider({ sendButtonWaitMs: 600, confirmedSendShortcut: null });
    await expect(p.submitPlainPrompt('no button')).rejects.toMatchObject({
      code: 'SELECTOR_NOT_FOUND',
    });
  }, 30_000);
});
