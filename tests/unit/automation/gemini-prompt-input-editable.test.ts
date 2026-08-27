import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { GeminiSelectorRegistry } from '@main/automation/providers/google/selectors/google-gemini.selectors';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/gemini');

describe('GeminiSelectorRegistry promptInput vs Discover Sources', () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let browser: import('playwright').Browser;
  let context: import('playwright').BrowserContext;
  let page: import('playwright').Page;
  let tempRoot: string;

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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-gem-sel-'));
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it(
    'picks Hộp truy vấn, not disabled Discover Sources textarea',
    async () => {
      await page.goto(`${baseUrl}/notebooklm-discover-vs-chat.html`);
      const registry = new GeminiSelectorRegistry(page, path.join(tempRoot, 'diag'));
      const input = await registry.resolve('promptInput', { timeoutMs: 1_200, editable: true });
      const meta = await input.evaluate((el) => ({
        aria: el.getAttribute('aria-label'),
        form: el.getAttribute('formcontrolname'),
        disabled: el instanceof HTMLTextAreaElement ? el.disabled : false,
        classAttr: el.getAttribute('class'),
      }));
      expect(meta.aria).toBe('Hộp truy vấn');
      expect(meta.form).not.toBe('discoverSourcesQuery');
      expect(meta.disabled).toBe(false);
      expect(meta.classAttr).toContain('query-box-input');
    },
    20_000,
  );
});
