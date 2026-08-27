import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { GeminiBrowserProvider } from '@main/automation/providers/google/gemini-browser-provider';
import { AutomationError } from '@main/automation/errors/automation-errors';
import { BrowserEventLogger } from '@main/automation/browser-event-logger';
import { formatCorrelationMarker } from '@shared/constants/gemini';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/gemini');

function minimalPack(prompt: string): TranslationPackDto {
  return {
    projectId: '00000000-0000-4000-8000-000000000010',
    chapterIds: ['00000000-0000-4000-8000-000000000011'],
    chapterNumbers: [1],
    style: 'balanced',
    prompt,
    baseContext: '',
    operationPrompt: '',
    operationType: 'TRANSLATE',
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

describe('GeminiBrowserProvider (streaming fixture DOM)', () => {
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-gem-'));
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function provider(): GeminiBrowserProvider {
    const eventLogger = new BrowserEventLogger(null, path.join(tempRoot, 'events'));
    const p = new GeminiBrowserProvider({
      diagnosticsDir: path.join(tempRoot, 'diag'),
      baseUrl: `${baseUrl}/chat-ready.html`,
      eventLogger,
      maxTimeoutMs: 20_000,
      stabilizationWindowMs: 600,
      noIndicatorStabilizationWindowMs: 600,
    });
    p.attachPage(page);
    return p;
  }

  it('detectLogin returns true on chat fixture', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    expect(await provider().detectLogin()).toBe(true);
  });

  it('detectLogin returns false on login fixture', async () => {
    await page.goto(`${baseUrl}/login-required.html`);
    expect(await provider().detectLogin()).toBe(false);
  });

  it('detectQuotaLimit on quota fixture', async () => {
    await page.goto(`${baseUrl}/quota-limit.html`);
    expect(await provider().detectQuotaLimit()).toBe(true);
  });

  it('detectUserActionRequired returns CAPTCHA', async () => {
    await page.goto(`${baseUrl}/captcha.html`);
    expect(await provider().detectUserActionRequired()).toBe('CAPTCHA');
  });

  it(
    'waits for streaming to finish and extracts correlated response only',
    async () => {
      await page.goto(`${baseUrl}/chat-ready.html`);
      const p = provider();
      const correlationId = '00000000-0000-4000-8000-000000000099';
      const pack = minimalPack(`Translate chapter 1.\n${formatCorrelationMarker(correlationId)}`);

      await p.createOrOpenTranslationThread();
      await p.submitTranslationPack(pack, correlationId);
      await p.waitForGenerationStart();
      await p.waitForGenerationComplete(correlationId);

      const raw = await p.extractLatestResponse(correlationId);
      expect(raw.text).toContain('<TRANSLATION>');
      expect(raw.text).toContain('Bản dịch thử nghiệm');
      expect(raw.text).not.toContain('Previous conversation output');
    },
    20_000,
  );

  it('sendPack end-to-end returns raw text (no TERM_DELTA parse)', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const p = provider();
    const pack = minimalPack('Full send loop test');
    const raw = await p.sendPack(pack);
    expect(raw.text).toContain('<TRANSLATION>');
    expect(raw.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  }, 20_000);

  it('cancelGeneration stops streaming early', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const p = provider();
    const correlationId = '00000000-0000-4000-8000-000000000088';
    const pack = minimalPack(`Cancel test\n${formatCorrelationMarker(correlationId)}`);

    await p.submitTranslationPack(pack, correlationId);
    await p.waitForGenerationStart();
    await p.cancelGeneration();

    await expect(
      p.waitForGenerationComplete(correlationId, { maxTimeoutMs: 3_000 }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TIMEOUT' });
  });

  it('throws SELECTOR_NOT_FOUND with diagnostics on broken page', async () => {
    await page.goto(`${baseUrl}/login-required.html`);
    const p = provider();
    try {
      await p.createOrOpenTranslationThread();
      expect.fail('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AutomationError);
      const err = error as AutomationError;
      expect(['SELECTOR_NOT_FOUND', 'LOGIN_REQUIRED']).toContain(err.code);
    }
  });
});
