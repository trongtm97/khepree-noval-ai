import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { GeminiBrowserProvider } from '@main/automation/providers/google/gemini-browser-provider';
import { BrowserEventLogger } from '@main/automation/browser-event-logger';
import { createResponseAnchor, resolveAssistantForAnchor } from '@main/automation/providers/google/response-anchor';
import { userMessageLocators } from '@main/automation/providers/google/conversation-snapshot';
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

describe('Response anchoring', () => {
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-anchor-'));
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

  it('A: old response exists + send fails → never returns old bubble', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=click-noop`);
    const p = provider({ sendConfirmTimeoutMs: 1_200 });
    await expect(p.submitPlainPrompt('will fail')).rejects.toMatchObject({
      code: 'SEND_NOT_CONFIRMED',
    });
    let extractErr: unknown;
    try {
      await p.extractLatestResponse('00000000-0000-4000-8000-000000000099');
    } catch (err) {
      extractErr = err;
    }
    expect(extractErr).toBeTruthy();
    expect(String((extractErr as { code?: unknown }).code)).toMatch(/RESPONSE_NOT_FOUND/);
    const oldText = await page.getByTestId('assistant-response').first().innerText();
    expect(oldText).toContain('Previous conversation');
  }, 25_000);

  it('B: old + new response → returns only the new anchored response', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const p = provider();
    const correlationId = '00000000-0000-4000-8000-0000000000aa';
    await p.submitTranslationPack(minimalPack('new turn'), correlationId);
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(correlationId);
    const raw = await p.extractLatestResponse(correlationId);
    expect(raw.text).toContain('Bản dịch thử nghiệm');
    expect(raw.text).not.toContain('Previous conversation');
  }, 30_000);

  it('C: multiple responses → extract matches marker / correlation', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=multi-marker`);
    const p = provider();
    const id1 = '00000000-0000-4000-8000-0000000000b1';
    const id2 = '00000000-0000-4000-8000-0000000000b2';
    await p.submitPlainPrompt('first', id1);
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(id1);
    const first = await p.extractLatestResponse(id1);
    expect(first.text).toContain(id1);
    expect(first.text).not.toContain(id2);

    await p.submitPlainPrompt('second', id2);
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(id2);
    const second = await p.extractLatestResponse(id2);
    expect(second.text).toContain(id2);
    expect(second.text).not.toContain(id1);
  }, 45_000);

  it('D: DOM rerender recovers anchor via user marker', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=rerender`);
    const p = provider();
    const correlationId = '00000000-0000-4000-8000-0000000000cc';
    await p.submitPlainPrompt('rerender me', correlationId);
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(correlationId);
    const raw = await p.extractLatestResponse(correlationId);
    expect(raw.text).toContain('<TRANSLATION>');
  }, 30_000);

  it('E: virtualized old conversation still does not pick wrong bubble', async () => {
    await page.goto(`${baseUrl}/chat-ready.html?mode=virtualize-old`);
    const p = provider();
    const correlationId = '00000000-0000-4000-8000-0000000000dd';
    await p.submitPlainPrompt('virtualize', correlationId);
    await p.waitForGenerationStart();
    await p.waitForGenerationComplete(correlationId);
    const raw = await p.extractLatestResponse(correlationId);
    expect(raw.text).toContain('Bản dịch thử nghiệm');
    expect(raw.text).not.toContain('Previous conversation');
  }, 30_000);

  it('resolveAssistantForAnchor rejects baseline-only old bubble', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const assistants = page.getByTestId('assistant-response');
    const { fingerprintText } = await import(
      '@main/automation/providers/google/response-anchor'
    );
    const text = (await assistants.first().innerText()).trim();
    const fp = fingerprintText(text);
    const anchor = createResponseAnchor({
      correlationId: '00000000-0000-4000-8000-0000000000ee',
      marker: '[NTS-CORR:00000000-0000-4000-8000-0000000000ee]',
      assistantCount: 1,
      lastAssistantHash: fp,
      assistantFingerprints: [fp],
    });
    const result = await resolveAssistantForAnchor({
      page,
      assistants,
      anchor,
      userLocator: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.ambiguous).toBe(false);
    }
    expect(await userMessageLocators(page).count()).toBe(0);
  });
});
