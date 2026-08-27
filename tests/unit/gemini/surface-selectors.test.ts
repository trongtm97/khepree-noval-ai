import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { GeminiSelectorRegistry } from '@main/automation/providers/google/selectors/google-gemini.selectors';
import { detectUiSurface } from '@main/automation/providers/google/surface/surface-detector';
import { GEMINI_CHAT_SELECTORS } from '@main/automation/providers/google/selectors/gemini-chat.selectors';
import { GEMINI_NOTEBOOK_SELECTORS } from '@main/automation/providers/google/selectors/gemini-notebook.selectors';
import { NOTEBOOKLM_SELECTORS } from '@main/automation/providers/google/selectors/notebooklm.selectors';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/gemini');

describe('Surface-aware selector architecture', () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let browser: import('playwright').Browser;
  let context: import('playwright').BrowserContext;
  let page: import('playwright').Page;
  let tempRoot: string;
  const wins: Array<Record<string, unknown>> = [];

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
    wins.length = 0;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-surface-'));
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function registry(): GeminiSelectorRegistry {
    return new GeminiSelectorRegistry(page, path.join(tempRoot, 'diag'), (win) => {
      wins.push({ ...win });
    });
  }

  it('detects GEMINI_CHAT fixture surface', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const detection = await detectUiSurface(page);
    expect(detection.surface).toBe('GEMINI_CHAT');
    const r = registry();
    expect(await r.ensureSurface()).toBe('GEMINI_CHAT');
    const input = await r.resolve('promptInput', { editable: true });
    expect(await input.getAttribute('data-testid')).toBe('prompt-input');
    expect(wins.some((w) => w.operation === 'resolve:promptInput')).toBe(true);
    expect(wins[0]).toMatchObject({
      surface: 'GEMINI_CHAT',
    });
    expect(typeof wins.find((w) => w.operation === 'resolve:promptInput')?.strategyId).toBe(
      'string',
    );
    expect(typeof wins.find((w) => w.operation === 'resolve:promptInput')?.fallbackDepth).toBe(
      'number',
    );
  }, 20_000);

  it('detects GEMINI_NOTEBOOK fixture surface', async () => {
    await page.goto(`${baseUrl}/gemini-notebook-chat.html`);
    const detection = await detectUiSurface(page);
    expect(detection.surface).toBe('GEMINI_NOTEBOOK');
    const r = registry();
    expect(await r.ensureSurface()).toBe('GEMINI_NOTEBOOK');
    const input = await r.resolve('promptInput', { editable: true });
    expect(await input.getAttribute('aria-label')).toMatch(/query box/i);
  }, 20_000);

  it('detects NOTEBOOKLM fixture + scopes composer away from Discover Sources', async () => {
    await page.goto(`${baseUrl}/notebooklm-chat.html`);
    expect((await detectUiSurface(page)).surface).toBe('NOTEBOOKLM');
    const r = registry();
    const input = await r.resolve('promptInput', { editable: true });
    const aria = await input.getAttribute('aria-label');
    expect(aria).toMatch(/hộp truy vấn/i);
    expect(aria).not.toMatch(/khám phá nguồn/i);
  }, 20_000);

  it('dedupes assistant bubbles (nested text does not inflate count)', async () => {
    await page.goto(`${baseUrl}/notebooklm-chat.html`);
    const r = registry();
    await r.ensureSurface();
    const count = await r.assistantResponses().count();
    expect(count).toBe(2);
  }, 15_000);

  it('catalogs prefer accessible strategies before CSS', () => {
    for (const catalog of [
      GEMINI_CHAT_SELECTORS,
      GEMINI_NOTEBOOK_SELECTORS,
      NOTEBOOKLM_SELECTORS,
    ]) {
      const prompt = catalog.promptInput.strategies;
      const firstCss = prompt.findIndex((s) => s.kind === 'css');
      const firstAccessible = prompt.findIndex((s) =>
        ['role', 'label', 'placeholder', 'testId'].includes(s.kind),
      );
      expect(firstAccessible).toBeGreaterThanOrEqual(0);
      if (firstCss >= 0) {
        expect(firstAccessible).toBeLessThan(firstCss);
      }
      for (const s of catalog.appShell.strategies) {
        if (s.kind === 'css') {
          expect(s.css.trim().toLowerCase()).not.toBe('h1');
          expect(s.css.trim().toLowerCase()).not.toBe('button');
          expect(s.css.trim().toLowerCase()).not.toBe('[contenteditable=true]');
        }
      }
    }
  });

  it('fast probe finishes well under sequential 2.5s×N budget', async () => {
    await page.goto(`${baseUrl}/chat-ready.html`);
    const r = registry();
    const t0 = Date.now();
    await r.resolve('promptInput', { timeoutMs: 2_500, editable: true });
    expect(Date.now() - t0).toBeLessThan(2_000);
  }, 15_000);
});
