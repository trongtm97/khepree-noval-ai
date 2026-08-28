import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startFixtureServer } from '../automation/fixture-server';
import { NotebookProvider } from '@main/automation/providers/google/notebook-provider';
import { AutomationError } from '@main/automation/errors/automation-errors';
import { formatNotebookName } from '@shared/constants/notebook';
import { KNOWLEDGE_PROJECT_FILES } from '@shared/constants/knowledge';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/notebook');

describe('NotebookProvider (fixture DOM)', () => {
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
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-nb-'));
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function provider(): NotebookProvider {
    const p = new NotebookProvider({
      diagnosticsDir: path.join(tempRoot, 'diag'),
      baseUrl: `${baseUrl}/home.html`,
    });
    p.attachPage(page);
    return p;
  }

  it('detectAvailability returns true on fixture shell', async () => {
    await page.goto(`${baseUrl}/home.html`);
    const p = provider();
    expect(await p.detectAvailability()).toBe(true);
  });

  it('detectAvailability fails on broken DOM with SELECTOR_NOT_FOUND path', async () => {
    await page.goto(`${baseUrl}/broken.html`);
    const p = provider();
    expect(await p.detectAvailability()).toBe(false);
    await expect(p.createNotebook('[NovelTrans] X')).rejects.toMatchObject({
      code: 'SELECTOR_NOT_FOUND',
    });
  }, 15_000);

  it('creates notebook idempotently (no duplicate)', async () => {
    await page.goto(`${baseUrl}/home.html`);
    const p = provider();
    const name = formatNotebookName('Fixture Novel');

    const first = await p.createNotebook(name);
    expect(first.name).toBe(name);

    const second = await p.createNotebook(name);
    expect(second.name).toBe(name);

    const list = await p.listNotebooks();
    expect(list.filter((n) => n.name === name)).toHaveLength(1);
  });

  it('creates notebook via live navigate+rename path', async () => {
    await page.goto(`${baseUrl}/home-live-create.html`);
    const p = new NotebookProvider({
      diagnosticsDir: path.join(tempRoot, 'diag'),
      baseUrl: `${baseUrl}/home-live-create.html`,
    });
    p.attachPage(page);
    const name = formatNotebookName('Live Create Novel');
    const created = await p.createNotebook(name);
    expect(created.name).toBe(name);
    const state = await p.getNotebookState();
    expect(state.currentName).toBe(name);
    const opened = await p.openNotebook(name);
    expect(opened.name).toBe(name);
  }, 20_000);

  it('ensureNotebook renames existing untitled instead of creating', async () => {
    await page.goto(`${baseUrl}/home-untitled.html`);
    const p = new NotebookProvider({
      diagnosticsDir: path.join(tempRoot, 'diag'),
      baseUrl: `${baseUrl}/home-untitled.html`,
    });
    p.attachPage(page);
    const name = formatNotebookName('Truyện 1');
    const ensured = await p.ensureNotebook(name);
    expect(ensured.name).toBe(name);
    const state = await p.getNotebookState();
    expect(state.currentName).toBe(name);
  }, 20_000);

  it('opens notebook, adds drive sources without duplicates, sets instructions', async () => {
    await page.goto(`${baseUrl}/home.html`);
    const p = provider();
    const name = formatNotebookName('Source Novel');
    await p.createNotebook(name);
    await p.openNotebook(name);

    const sources = [...KNOWLEDGE_PROJECT_FILES];
    const first = await p.addDriveSources(sources);
    expect(first.added.length).toBe(sources.length);
    expect(first.skipped.length).toBe(0);

    const second = await p.addDriveSources(sources);
    expect(second.added.length).toBe(0);
    expect(second.skipped.length).toBe(sources.length);

    const instructions = 'Translate Chinese to Vietnamese. Use locked terms.';
    await p.setInstructions(instructions);

    const verified = await p.verifySources(sources);
    expect(verified.ok).toBe(true);

    const state = await p.getNotebookState();
    expect(state.open).toBe(true);
    expect(state.currentName).toBe(name);
    expect(state.sourceNames).toEqual(expect.arrayContaining(sources));
    expect(state.instructions).toBe(instructions);
  }, 20_000);

  it('addTextSources pastes knowledge docs via Copied text', async () => {
    await page.goto(`${baseUrl}/home.html`);
    const p = provider();
    const name = formatNotebookName('Text Sources');
    await p.createNotebook(name);
    await p.openNotebook(name);

    const sources = [
      { name: '00_BOOK_PROFILE.md', content: '# Profile\nHero journeys.' },
      { name: '01_TRANSLATION_RULES.md', content: '# Rules\nKeep names.' },
    ];
    const first = await p.addTextSources(sources);
    expect(first.added).toEqual(['00_BOOK_PROFILE.md', '01_TRANSLATION_RULES.md']);
    const verified = await p.verifySources(sources.map((s) => s.name));
    expect(verified.ok).toBe(true);
  }, 20_000);

  it('addFileSources uploads local markdown in one shot', async () => {
    await page.goto(`${baseUrl}/home.html`);
    const p = provider();
    const name = formatNotebookName('File Upload');
    await p.createNotebook(name);
    await p.openNotebook(name);

    const dir = path.join(tempRoot, 'sources');
    fs.mkdirSync(dir, { recursive: true });
    const files = [
      { name: '00_BOOK_PROFILE.md', content: '# Profile\nHero.' },
      { name: '01_TRANSLATION_RULES.md', content: '# Rules\nKeep.' },
    ];
    const paths = files.map((f) => {
      const fp = path.join(dir, f.name);
      fs.writeFileSync(fp, f.content, 'utf8');
      return fp;
    });

    const first = await p.addFileSources(paths);
    expect(first.added).toEqual(['00_BOOK_PROFILE.md', '01_TRANSLATION_RULES.md']);
    const verified = await p.verifySources(files.map((f) => f.name));
    expect(verified.ok).toBe(true);

    const second = await p.addFileSources(paths);
    expect(second.added).toEqual([]);
    expect(second.skipped).toEqual(['00_BOOK_PROFILE.md', '01_TRANSLATION_RULES.md']);
  }, 60_000);

  it('addFileSources skips when fuzzy titles already cover filenames', async () => {
    const name = formatNotebookName('Fuzzy Titles');
    await page.goto(`${baseUrl}/notebook-open.html?name=${encodeURIComponent(name)}`);
    const p = provider();

    // Pre-seed sources with titles that are NOT exact filenames (live UI behavior)
    await page.evaluate(() => {
      const list = document.getElementById('source-list');
      if (!list) return;
      for (const label of ['Truyện 1 — Book Profile', 'Truyện 1 — Translation Rules']) {
        const li = document.createElement('li');
        li.setAttribute('data-testid', 'source-item');
        li.setAttribute('data-source-item', '1');
        li.setAttribute('data-source-name', label);
        li.textContent = label;
        list.appendChild(li);
      }
    });

    const dir = path.join(tempRoot, 'fuzzy');
    fs.mkdirSync(dir, { recursive: true });
    const paths = ['00_BOOK_PROFILE.md', '01_TRANSLATION_RULES.md'].map((n) => {
      const fp = path.join(dir, n);
      fs.writeFileSync(fp, `# ${n}\n`, 'utf8');
      return fp;
    });

    const result = await p.addFileSources(paths);
    expect(result.skipped).toEqual(['00_BOOK_PROFILE.md', '01_TRANSLATION_RULES.md']);
    expect(result.added).toEqual([]);
    const state = await p.getNotebookState();
    expect(state.sourceNames).toHaveLength(2);
  }, 15_000);

  it('addTextSources dismisses CDK backdrop before Add click', async () => {
    const name = formatNotebookName('Blocked Add');
    await page.goto(
      `${baseUrl}/notebook-open.html?name=${encodeURIComponent(name)}&block=1`,
    );
    const p = provider();
    const sources = [{ name: '00_BOOK_PROFILE.md', content: '# Profile\nBody.' }];
    const first = await p.addTextSources(sources);
    expect(first.added).toEqual(['00_BOOK_PROFILE.md']);
  }, 20_000);

  it('renameNotebook updates title display', async () => {
    await page.goto(`${baseUrl}/home.html`);
    const p = provider();
    const name = formatNotebookName('Rename Me');
    await p.createNotebook(name);
    await p.openNotebook(name);
    await p.renameNotebook('[NovelTrans] Renamed');
    const state = await p.getNotebookState();
    expect(state.currentName).toBe('[NovelTrans] Renamed');
  }, 15_000);

  it('captures diagnostics on SELECTOR_NOT_FOUND', async () => {
    await page.goto(`${baseUrl}/broken.html`);
    const p = provider();
    try {
      await p.createNotebook('x');
      expect.fail('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AutomationError);
      const err = error as AutomationError;
      expect(err.code).toBe('SELECTOR_NOT_FOUND');
      expect(err.diagnostics?.screenshotPath ?? err.diagnostics?.htmlSnapshotPath).toBeTruthy();
    }
  }, 15_000);
});

describe('formatNotebookName', () => {
  it('prefixes NovelTrans tag', () => {
    expect(formatNotebookName('My Novel')).toBe('[NovelTrans] My Novel');
  });
});
