import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { GeminiBrowserProvider } from '@main/automation/providers/google/gemini-browser-provider';
import { BrowserEventLogger } from '@main/automation/browser-event-logger';
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

describe('Target generation lifecycle (fixture)', () => {
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-life-'));
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
      maxTimeoutMs: 25_000,
      stabilizationWindowMs: 500,
      noIndicatorStabilizationWindowMs: 700,
      sendConfirmTimeoutMs: 3_000,
      sendButtonWaitMs: 2_500,
      ...extras,
    });
    p.attachPage(page);
    return p;
  }

  async function runTurn(mode: string, correlationId: string) {
    await page.goto(`${baseUrl}/chat-ready.html?mode=${mode}`);
    const p = provider();
    await p.submitTranslationPack(minimalPack('lifecycle turn'), correlationId);
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(correlationId);
    return p.extractLatestResponse(correlationId);
  }

  it('token growth → complete with protocol text', async () => {
    const correlationId = '00000000-0000-4000-8000-0000000000b1';
    const raw = await runTurn('ok', correlationId);
    expect(raw.text).toContain('</TRANSLATION>');
    expect(raw.text).not.toContain('Previous conversation');
  }, 35_000);

  it('pause 2s mid-stream then continue → still completes', async () => {
    const correlationId = '00000000-0000-4000-8000-0000000000b2';
    const raw = await runTurn('stream-pause', correlationId);
    expect(raw.text).toContain('Bản dịch thử nghiệm');
  }, 40_000);

  it('spinner disappears early while tokens grow → does not use old bubble', async () => {
    const correlationId = '00000000-0000-4000-8000-0000000000b3';
    const raw = await runTurn('spinner-early', correlationId);
    expect(raw.text).toContain('</TRANSLATION>');
    expect(raw.text).not.toContain('Previous conversation');
  }, 40_000);

  it('DOM rerender mid-stream → still anchors target', async () => {
    const correlationId = '00000000-0000-4000-8000-0000000000b4';
    const raw = await runTurn('dom-rerender', correlationId);
    expect(raw.text).toContain('</TRANSLATION>');
  }, 40_000);

  it('output cutoff → OUTPUT_INCOMPLETE', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=cutoff`);
    const p = provider({ maxTimeoutMs: 5_000, stabilizationWindowMs: 400, noIndicatorStabilizationWindowMs: 400 });
    const correlationId = '00000000-0000-4000-8000-0000000000b5';
    await p.submitTranslationPack(minimalPack('cutoff'), correlationId);
    await p.waitForGenerationStart();
    await expect(p.waitForGenerationComplete(correlationId)).rejects.toMatchObject({
      code: 'OUTPUT_INCOMPLETE',
    });
  }, 20_000);

  it('response error bubble → GENERATION_ERROR', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=response-error`);
    const p = provider({ maxTimeoutMs: 8_000 });
    const correlationId = '00000000-0000-4000-8000-0000000000b6';
    await p.submitTranslationPack(minimalPack('err'), correlationId);
    await p.waitForGenerationStart();
    await expect(p.waitForGenerationComplete(correlationId)).rejects.toMatchObject({
      code: 'GENERATION_ERROR',
    });
  }, 20_000);
});
