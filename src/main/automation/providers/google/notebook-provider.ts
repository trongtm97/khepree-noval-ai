import type { Page } from 'playwright';
import path from 'node:path';
import type { AutomationProvider, AutomationProviderHealth } from '../automation-provider';
import type { BrowserSession } from '../../browser-session';
import { AutomationError } from '../../errors/automation-errors';
import { captureFailureDiagnostics } from '../../diagnostics';
import {
  NotebookSelectorRegistry,
} from './selectors/google-notebook.selectors';
import { NOTEBOOK_URL } from '@shared/constants/notebook';
import { logger } from '../../../logging/logger';
import { hasDriveLivePresence } from '../../../notebook/notebook-source-presence';

export interface NotebookSummary {
  name: string;
  id: string | null;
  url: string | null;
}

export interface NotebookState {
  available: boolean;
  currentName: string | null;
  currentUrl: string | null;
  sourceNames: string[];
  instructions: string | null;
  open: boolean;
}

export interface NotebookProviderOptions {
  diagnosticsDir: string;
  baseUrl?: string;
}

export type NotebookSourceUiStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'ERROR'
  | 'UNKNOWN';

function extractNotebookId(url: string): string | null {
  const match = /\/notebook\/([^/?#]+)/i.exec(url);
  return match?.[1] ?? null;
}

/**
 * NotebookLM provider via Playwright.
 * Locators only via NotebookSelectorRegistry — never hardcode CSS here.
 */
export class NotebookProvider implements AutomationProvider {
  readonly providerId = 'google-notebook';
  private page: Page | null = null;
  private session: BrowserSession | null = null;
  private selectors: NotebookSelectorRegistry | null = null;
  private readonly diagnosticsDir: string;
  private readonly baseUrl: string;

  constructor(options: NotebookProviderOptions) {
    this.diagnosticsDir = options.diagnosticsDir;
    this.baseUrl = options.baseUrl ?? NOTEBOOK_URL;
  }

  /** Test / advanced: attach a raw Playwright page (fixture DOM). */
  attachPage(page: Page): void {
    this.page = page;
    this.selectors = new NotebookSelectorRegistry(page, this.diagnosticsDir);
  }

  async attach(session: BrowserSession): Promise<void> {
    this.session = session;
    const page = session.getPage();
    if (!page) {
      throw new AutomationError('UNKNOWN_UI', 'BrowserSession has no page');
    }
    this.attachPage(page);
    await Promise.resolve();
  }

  async healthCheck(): Promise<AutomationProviderHealth> {
    if (!this.page && !this.session) {
      return { ok: false, message: 'NotebookProvider not attached' };
    }
    try {
      const available = await this.detectAvailability();
      return {
        ok: available,
        message: available ? 'NotebookLM UI available' : 'NotebookLM UI not detected',
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'health check failed',
      };
    }
  }

  async detach(): Promise<void> {
    this.page = null;
    this.session = null;
    this.selectors = null;
    await Promise.resolve();
  }

  async detectAvailability(): Promise<boolean> {
    const page = this.requirePage();
    let url = page.url();

    if (/accounts\.google\.com/i.test(url)) {
      return false;
    }

    const onLocalFixture =
      url.includes('127.0.0.1') || url.includes('localhost');
    const onNotebookHost = /notebooklm\.google|notebook\.google/i.test(url);
    const needsGoto =
      url === 'about:blank' ||
      url === '' ||
      (!onLocalFixture && !onNotebookHost && !/\/notebook\//i.test(url));

    if (needsGoto) {
      await page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      url = page.url();
      if (/accounts\.google\.com/i.test(url)) {
        return false;
      }
    }

    if (await this.hasNotebookShell(page)) {
      return true;
    }

    // Live SPA paints late — brief poll on Google hosts only.
    if (onNotebookHost || /notebooklm\.google|notebook\.google/i.test(page.url())) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await page.waitForTimeout(500);
        if (/accounts\.google\.com/i.test(page.url())) return false;
        if (await this.hasNotebookShell(page)) return true;
      }
    }
    return false;
  }

  /** Fast shell probe — no multi-strategy wait cascade. */
  private async hasNotebookShell(page: Page): Promise<boolean> {
    const shell = page.locator(
      [
        '[data-testid="notebook-app"]',
        '[data-notebook-app]',
        'welcome-page',
        'labs-tailwind-root',
        'a[aria-label*="Gemini Notebook"]',
        'button[aria-label="Cài đặt"]',
        'button[aria-label="Settings"]',
        'button[aria-label="Create new notebook"]',
        'button[aria-label*="Tạo sổ ghi chú"]',
      ].join(', '),
    );
    if ((await shell.count()) > 0) {
      const visible = await shell.first().isVisible().catch(() => false);
      if (visible) return true;
      // Custom elements may not report visible but are attached
      if ((await page.locator('welcome-page, labs-tailwind-root, [data-notebook-app]').count()) > 0) {
        return true;
      }
    }
    const createLabel = page.getByText(/Tạo sổ ghi chú mới|Create new notebook/i);
    if ((await createLabel.count()) > 0) {
      return createLabel.first().isVisible().catch(() => false);
    }
    return false;
  }

  async listNotebooks(): Promise<NotebookSummary[]> {
    await this.ensureApp();
    const registry = this.requireSelectors();
    const items = registry.notebookItemLocator();
    const count = await items.count();
    const results: NotebookSummary[] = [];
    for (let i = 0; i < count; i += 1) {
      const item = items.nth(i);
      const fromAttr = await item.getAttribute('data-notebook-name');
      let name = fromAttr?.trim() ?? '';
      if (!name) {
        const heading = item.locator('h3').first();
        if ((await heading.count()) > 0) {
          name = (await heading.innerText()).trim();
        } else {
          name = (await item.innerText()).trim().split('\n')[0]?.trim() ?? '';
        }
      }
      // Skip create-new pseudo-cards (EN + VI Gemini Notebook)
      if (
        !name ||
        /create new notebook|create new|tạo sổ ghi chú mới|tạo sổ tay|tạo notebook/i.test(
          name,
        )
      ) {
        continue;
      }
      results.push({
        name,
        id: await item.getAttribute('data-notebook-id'),
        url: (await item.getAttribute('href')) ?? null,
      });
    }
    return results;
  }

  async findNotebookByName(name: string): Promise<NotebookSummary | null> {
    const notebooks = await this.listNotebooks();
    const normalized = name.trim();
    return (
      notebooks.find((notebook) => notebook.name.trim() === normalized) ??
      notebooks.find((notebook) => notebook.name.includes(normalized)) ??
      null
    );
  }

  /** True for empty auto-created notebooks (EN/VI). */
  isUntitledNotebookName(name: string): boolean {
    return /untitled|không có tiêu đề/i.test(name.trim());
  }

  /**
   * Ensure a notebook with this exact name exists.
   * Prefer rename of an existing untitled notebook (avoids duplicates), else create.
   */
  async ensureNotebook(name: string): Promise<NotebookSummary> {
    const existing = await this.findNotebookByName(name);
    if (existing) return existing;

    const untitled = (await this.listNotebooks()).find((notebook) =>
      this.isUntitledNotebookName(notebook.name),
    );
    if (untitled) {
      await this.openNotebook(untitled.name);
      await this.dismissBlockingOverlays();
      await this.renameNotebook(name);
      return {
        name,
        id: untitled.id ?? extractNotebookId(this.requirePage().url()),
        url: this.requirePage().url(),
      };
    }

    return this.createNotebook(name);
  }

  /**
   * Create notebook (idempotent).
   * - Fixture / older UI: title dialog → Enter → appears in list
   * - Live Gemini Notebook: Create → navigate `/notebook/{id}` → rename title
   */
  async createNotebook(name: string): Promise<NotebookSummary> {
    const existing = await this.findNotebookByName(name);
    if (existing) return existing;

    await this.ensureApp();
    const page = this.requirePage();
    const registry = this.requireSelectors();

    // Prefer grid view so project cards / hrefs are present on live UI
    const grid = page.getByRole('button', { name: /grid view|chế độ xem lưới/i });
    if ((await grid.count()) > 0) {
      await grid.first().click().catch(() => undefined);
      await page.waitForTimeout(300);
    }

    const createBtn = await registry.resolve('createNotebookButton');
    await createBtn.click();

    // Live UI often auto-opens add-source / onboarding — clear before rename.
    await this.dismissBlockingOverlays();

    // Path A — same-page title dialog (fixture home.html)
    const dialogInput = page.getByTestId('notebook-title-input');
    const dialogVisible = await dialogInput
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (dialogVisible) {
      await dialogInput.fill(name);
      await dialogInput.press('Enter');
      const created = await this.findNotebookByName(name);
      if (!created) {
        throw await this.fail(
          'UNKNOWN_UI',
          `Created notebook but could not find it by name: ${name}`,
          'createNotebook',
        );
      }
      return created;
    }

    // Path B — live UI / home-live-create: already navigated into notebook
    const landed =
      this.isNotebookDetailUrl(page.url()) ||
      (await page.getByTestId('notebook-title').count()) > 0 ||
      (await page.locator('[data-notebook-title-display]').count()) > 0 ||
      (await page.locator('input.title-input').count()) > 0;
    if (!landed) {
      try {
        await Promise.race([
          page.waitForURL(/\/notebook\//i, { timeout: 20_000 }),
          page.waitForURL(/notebook-open\.html/i, { timeout: 20_000 }),
          page.getByTestId('notebook-title').waitFor({ state: 'visible', timeout: 20_000 }),
          page
            .locator('[data-notebook-title-display]')
            .waitFor({ state: 'visible', timeout: 20_000 }),
          page.locator('input.title-input').waitFor({ state: 'visible', timeout: 20_000 }),
        ]);
      } catch {
        throw await this.fail(
          'SELECTOR_NOT_FOUND',
          'Create notebook did not open a notebook (no /notebook/ URL or title)',
          'createNotebook',
        );
      }
    }

    await this.dismissBlockingOverlays();
    await this.renameNotebook(name);
    const url = page.url();
    return {
      name,
      id: extractNotebookId(url),
      url,
    };
  }

  async openNotebook(name: string): Promise<NotebookSummary> {
    await this.ensureApp();
    const page = this.requirePage();
    const registry = this.requireSelectors();

    // Already inside the target notebook (typical after live create)
    const alreadyOpen = await this.readCurrentNotebookName();
    if (alreadyOpen && (alreadyOpen === name || alreadyOpen.includes(name))) {
      return {
        name,
        id: extractNotebookId(page.url()),
        url: page.url(),
      };
    }

    // Inside a different notebook view — return to home/list first
    if (this.isNotebookDetailUrl(page.url()) || alreadyOpen) {
      await page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await this.ensureApp();
    }

    let notebook = await this.findNotebookByName(name);
    if (!notebook) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        `Notebook not found: ${name}`,
        'openNotebook',
      );
    }

    const item = registry.notebookItemLocator(name).first();
    await item.click();
    await registry.resolve('notebookTitleDisplay');
    notebook = {
      ...notebook,
      url: page.url(),
      id: notebook.id ?? extractNotebookId(page.url()),
    };
    return notebook;
  }

  async renameNotebook(newName: string): Promise<void> {
    const registry = this.requireSelectors();
    const page = this.requirePage();

    // Reveal editor when title is display-only (fixture / many live layouts)
    const title = await registry.tryResolve('notebookTitleDisplay', { timeoutMs: 1_500 });
    if (title) {
      await title.click().catch(() => undefined);
    }

    const input = await registry.resolve('notebookTitleInput');
    await input.fill(newName);
    await input.press('Enter');
    await page.waitForTimeout(200);
  }

  /**
   * Fast path: upload local .md files via hidden file input / filechooser.
   * Prefer multi-select in one shot; only re-upload files still clearly missing.
   */
  async addFileSources(
    filePaths: string[],
  ): Promise<{ added: string[]; skipped: string[] }> {
    const registry = this.requireSelectors();
    const page = this.requirePage();
    const existing = await this.readSourceNames();
    const beforeCount = existing.length;
    const skipped: string[] = [];
    const pendingPaths: string[] = [];

    for (const filePath of filePaths) {
      const name = path.basename(filePath);
      if (this.sourceNamePresent(existing, name)) {
        skipped.push(name);
      } else {
        pendingPaths.push(filePath);
      }
    }
    if (pendingPaths.length === 0) {
      return { added: [], skipped };
    }

    const uploadBatch = async (paths: string[]): Promise<void> => {
      let fileInput = await registry.tryResolve('fileInput', {
        timeoutMs: 600,
        visible: false,
      });

      if (!fileInput) {
        if (await this.hasBlockingBackdrop()) {
          const uploadInDialog = await registry.tryResolve('uploadFilesOption', {
            timeoutMs: 1_200,
          });
          if (uploadInDialog && (await uploadInDialog.isVisible().catch(() => false))) {
            const chooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(
              () => null,
            );
            await uploadInDialog.click({ timeout: 8_000 });
            const chooser = await chooserPromise;
            if (chooser) {
              await chooser.setFiles(paths);
              return;
            }
            fileInput = await registry.tryResolve('fileInput', {
              timeoutMs: 1_500,
              visible: false,
            });
          }
          if (!fileInput) {
            await this.dismissBlockingOverlays();
          }
        }

        if (!fileInput) {
          const addBtn = await registry.resolve('addSourceButton');
          await addBtn.click({ timeout: 10_000 });
          await page.waitForTimeout(400);

          const uploadOpt = await registry.tryResolve('uploadFilesOption', {
            timeoutMs: 2_000,
          });
          if (uploadOpt) {
            const chooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(
              () => null,
            );
            await uploadOpt.click({ timeout: 8_000 });
            const chooser = await chooserPromise;
            if (chooser) {
              await chooser.setFiles(paths);
              return;
            }
          }

          fileInput = await registry.tryResolve('fileInput', {
            timeoutMs: 2_500,
            visible: false,
          });
        }
      }

      if (!fileInput) {
        throw await this.fail(
          'SELECTOR_NOT_FOUND',
          'File upload input not found for knowledge sources',
          'addFileSources',
        );
      }
      await fileInput.setInputFiles(paths);
    };

    // One multi-file upload only.
    await uploadBatch(pendingPaths);
    await this.waitForSourceProcessing(pendingPaths.length, beforeCount);

    let after = await this.readSourceNames();
    const grew = after.length - beforeCount;
    const pendingNames = pendingPaths.map((p) => path.basename(p));
    let missing = pendingNames.filter((name) => !this.sourceNamePresent(after, name));

    // Multi landed (count grew enough) but live UI titles may not match filenames —
    // do NOT re-upload (that creates duplicates).
    if (missing.length > 0 && grew >= pendingPaths.length) {
      return { added: pendingNames, skipped };
    }

    // Multi may be unsupported — upload only remaining missing, one-by-one.
    if (missing.length > 0 && pendingPaths.length > 1) {
      for (const filePath of pendingPaths) {
        const name = path.basename(filePath);
        after = await this.readSourceNames();
        if (this.sourceNamePresent(after, name)) continue;
        const beforeOne = after.length;
        await uploadBatch([filePath]);
        await this.waitForSourceProcessing(1, beforeOne);
      }
      after = await this.readSourceNames();
      missing = pendingNames.filter((name) => !this.sourceNamePresent(after, name));
    }

    const added: string[] = [];
    for (const name of pendingNames) {
      if (this.sourceNamePresent(after, name)) {
        added.push(name);
      } else if (grew >= pendingPaths.length) {
        // Count-based success; name matching failed on live titles
        added.push(name);
      } else {
        throw await this.fail(
          'UNKNOWN_UI',
          `Uploaded file but it did not appear in source list: ${name}` +
            (after.length ? ` (present: ${after.join(', ')})` : ''),
          'addFileSources',
        );
      }
    }

    return { added, skipped };
  }

  /**
   * Poll until NotebookLM source upload/indexing UI settles (AI CHAT BATCH pattern).
   * Done = no visible spinners + (check icons OR source count reached) for 2 stable polls.
   */
  async waitForSourceProcessing(
    expectedIncrease: number,
    sourceCountBefore?: number,
    timeoutMs = 180_000,
  ): Promise<boolean> {
    const page = this.requirePage();
    const before =
      sourceCountBefore ??
      (await this.getUploadStatus()).sourceCount;
    const targetCount = before + Math.max(0, expectedIncrease);
    const started = Date.now();
    let stable = 0;
    let sawSpinner = false;

    logger.info('wait_source_processing_start', {
      before,
      expectedIncrease,
      targetCount,
      timeoutMs,
    });

    while (Date.now() - started < timeoutMs) {
      await page.waitForTimeout(1_500);
      const state = await this.getUploadStatus();
      if (state.busy) sawSpinner = true;

      const done =
        !state.busy &&
        (expectedIncrease <= 0 ||
          state.checks > 0 ||
          state.sourceCount >= targetCount ||
          (sawSpinner && state.sourceCount > before));

      if (done) {
        stable += 1;
        if (stable >= 2) {
          logger.info('wait_source_processing_done', {
            sourceCount: state.sourceCount,
            checks: state.checks,
            elapsedMs: Date.now() - started,
          });
          return true;
        }
      } else {
        stable = 0;
      }
    }

    logger.warn('wait_source_processing_timeout', {
      before,
      targetCount,
      timeoutMs,
    });
    // Soft continue — caller may still verify names; avoid hard-fail on flaky DOM.
    return false;
  }

  /**
   * Per-source UI status for FULL preprocess (UPLOADED|PROCESSING|READY|ERROR).
   * Matches by basename; unknown names → absent (caller treats as not uploaded).
   */
  async inspectSourceStatuses(
    names: string[],
  ): Promise<{ name: string; status: NotebookSourceUiStatus; present: boolean }[]> {
    const page = this.requirePage();
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) return [];

    const rows = await page.evaluate((wantNames: string[]) => {
      const isVisible = (el: Element): boolean => {
        const box = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      };

      const candidates = Array.from(
        document.querySelectorAll(
          '[role="listitem"], mat-list-item, .source-item, [data-source-id], article, li',
        ),
      ).filter(isVisible);

      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const out: { name: string; status: string; present: boolean }[] = [];

      for (const want of wantNames) {
        const wantNorm = normalize(want);
        const wantStem = wantNorm.replace(/\.[a-z0-9]+$/i, '');
        let found: Element | null = null;
        for (const el of candidates) {
          const text = normalize(el.textContent || '');
          if (!text) continue;
          if (text.includes(wantNorm) || text.includes(wantStem)) {
            found = el;
            break;
          }
        }
        if (!found) {
          out.push({ name: want, status: 'UNKNOWN', present: false });
          continue;
        }
        const text = (found.textContent || '').toLowerCase();
        const hasSpinner =
          found.querySelector(
            'mat-spinner, mat-progress-spinner, mat-progress-bar, [role="progressbar"]',
          ) != null ||
          /processing|đang xử lý|indexing|đang lập chỉ mục/.test(text);
        const hasError =
          found.querySelector('mat-icon[color="warn"], .error, [aria-label*="error" i]') !=
            null || /error|failed|lỗi|thất bại/.test(text);
        const hasReady =
          Array.from(found.querySelectorAll('mat-icon')).some((icon) => {
            const t = (icon.textContent || '').trim();
            return ['check', 'done', 'check_circle'].includes(t);
          }) || /ready|đã sẵn sàng|complete|xong/.test(text);

        let status = 'UPLOADED';
        if (hasError) status = 'ERROR';
        else if (hasSpinner) status = 'PROCESSING';
        else if (hasReady) status = 'READY';
        else status = 'UPLOADED';

        out.push({ name: want, status, present: true });
      }
      return out;
    }, unique);

    return rows.map((r) => ({
      name: r.name,
      present: r.present,
      status: r.status as NotebookSourceUiStatus,
    }));
  }

  /**
   * Poll until every required source is READY. Hard-fails on ERROR or timeout.
   * Does NOT soft-continue after a fixed sleep.
   */
  async waitForNamedSourcesReady(
    names: string[],
    options?: {
      timeoutMs?: number;
      pollMs?: number;
      onProgress?: (snapshot: {
        ready: number;
        processing: number;
        uploaded: number;
        error: number;
        total: number;
        statuses: { name: string; status: NotebookSourceUiStatus; present: boolean }[];
      }) => void;
    },
  ): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 20 * 60 * 1000;
    const pollMs = options?.pollMs ?? 2_500;
    const page = this.requirePage();
    const started = Date.now();
    const required = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (required.length === 0) return;

    logger.info('wait_named_sources_ready_start', {
      count: required.length,
      timeoutMs,
    });

    while (Date.now() - started < timeoutMs) {
      const statuses = await this.inspectSourceStatuses(required);
      const ready = statuses.filter((s) => s.status === 'READY').length;
      const processing = statuses.filter((s) => s.status === 'PROCESSING').length;
      const uploaded = statuses.filter((s) => s.status === 'UPLOADED').length;
      const error = statuses.filter((s) => s.status === 'ERROR');
      const absent = statuses.filter((s) => !s.present);

      options?.onProgress?.({
        ready,
        processing,
        uploaded,
        error: error.length,
        total: required.length,
        statuses,
      });

      if (error.length > 0) {
        throw await this.fail(
          'UNKNOWN_UI',
          `Notebook source error: ${error.map((e) => e.name).join(', ')}`,
          'waitForNamedSourcesReady',
        );
      }

      // All present and READY (or present without spinner/error → treat as READY after settle)
      const allReady =
        statuses.length === required.length &&
        statuses.every((s) => s.present && (s.status === 'READY' || s.status === 'UPLOADED'));

      if (allReady && processing === 0) {
        // Require two consecutive stable READY/UPLOADED-with-no-busy polls
        const global = await this.getUploadStatus();
        if (!global.busy) {
          // Prefer explicit READY; if UI only shows UPLOADED + no spinner, accept.
          const explicitReady = statuses.every(
            (s) => s.present && (s.status === 'READY' || s.status === 'UPLOADED'),
          );
          if (explicitReady) {
            // Second poll
            await page.waitForTimeout(pollMs);
            const again = await this.inspectSourceStatuses(required);
            const global2 = await this.getUploadStatus();
            const stable =
              !global2.busy &&
              again.every((s) => s.present && (s.status === 'READY' || s.status === 'UPLOADED')) &&
              again.every((s) => s.status !== 'ERROR');
            if (stable) {
              logger.info('wait_named_sources_ready_done', {
                ready: again.filter((s) => s.status === 'READY' || s.status === 'UPLOADED')
                  .length,
                elapsedMs: Date.now() - started,
              });
              return;
            }
          }
        }
      }

      if (absent.length === required.length) {
        // Nothing landed yet — keep waiting until timeout
      }

      await page.waitForTimeout(pollMs);
    }

    throw await this.fail(
      'RESPONSE_TIMEOUT',
      `Notebook sources not READY within ${timeoutMs}ms (${required.join(', ')})`,
      'waitForNamedSourcesReady',
    );
  }

  async getUploadStatus(): Promise<{
    busy: boolean;
    checks: number;
    sourceCount: number;
    spinners: number;
  }> {
    const page = this.requirePage();
    return page.evaluate(() => {
      const isVisible = (el: Element): boolean => {
        const box = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      };
      const spinners = Array.from(
        document.querySelectorAll(
          'mat-spinner, mat-progress-spinner, mat-progress-bar',
        ),
      ).filter(isVisible).length;
      const checks = Array.from(
        document.querySelectorAll('mat-icon[data-mat-icon-type="font"]'),
      ).filter((el) => {
        const text = (el.textContent || '').trim();
        return isVisible(el) && ['check', 'done', 'check_circle'].includes(text);
      }).length;
      const body = document.body.innerText;
      const match = /(\d+)\s*(nguồn|sources?)/i.exec(body);
      const listCount = document.querySelectorAll(
        '[data-testid="source-item"], [data-source-item="1"], [data-source-list] > li, [data-source-list] > *',
      ).length;
      const sourceCount = match ? Math.max(parseInt(match[1], 10), listCount) : listCount;
      return { spinners, checks, sourceCount, busy: spinners > 0 };
    });
  }

  /**
   * Idempotent: skip sources already present in the notebook source list.
   * Fixture / Drive-picker path (data-testid drive files).
   * When preferLiveOverStatic: only skip if a drive-like (non-.md) card exists.
   */
  async addDriveSources(
    sourceNames: string[],
    options?: { preferLiveOverStatic?: boolean },
  ): Promise<{ added: string[]; skipped: string[] }> {
    const registry = this.requireSelectors();
    const existing = await this.readSourceNames();
    const added: string[] = [];
    const skipped: string[] = [];
    const preferLive = options?.preferLiveOverStatic === true;

    for (const sourceName of sourceNames) {
      const already =
        preferLive
          ? this.hasDriveLiveSource(existing, sourceName)
          : this.sourceNamePresent(existing, sourceName);
      if (already) {
        skipped.push(sourceName);
        continue;
      }

      if (await this.hasBlockingBackdrop()) {
        await this.dismissBlockingOverlays();
      }
      const addBtn = await registry.resolve('addSourceButton');
      await addBtn.click({ timeout: 10_000 });
      const driveOpt = await registry.resolve('driveSourceOption');
      await driveOpt.click();

      const picker = registry.driveFileLocator(sourceName);
      try {
        await picker.first().waitFor({ state: 'visible', timeout: 3_000 });
        await picker.first().click();
      } catch {
        // Also try .md legacy title in picker (older Drive markdown files).
        const legacyName = /\.md$/i.test(sourceName) ? null : `${sourceName}.md`;
        if (!legacyName) {
          throw await this.fail(
            'SELECTOR_NOT_FOUND',
            `Drive source picker item not found: ${sourceName}`,
            'addDriveSources',
          );
        }
        const legacy = registry.driveFileLocator(legacyName);
        try {
          await legacy.first().waitFor({ state: 'visible', timeout: 1_500 });
          await legacy.first().click();
        } catch {
          throw await this.fail(
            'SELECTOR_NOT_FOUND',
            `Drive source picker item not found: ${sourceName}`,
            'addDriveSources',
          );
        }
      }

      const confirm = await registry.resolve('confirmAddSource');
      await confirm.click();

      existing.push(sourceName);
      added.push(sourceName);
    }

    return { added, skipped };
  }

  /**
   * Prefer for live Gemini Notebook: paste knowledge docs via Copied text
   * (avoids brittle Drive picker iframe). Content from local DB builder.
   */
  async addTextSources(
    sources: { name: string; content: string }[],
  ): Promise<{ added: string[]; skipped: string[] }> {
    const registry = this.requireSelectors();
    const page = this.requirePage();
    const existing = await this.readSourceNames();
    const added: string[] = [];
    const skipped: string[] = [];

    for (const source of sources) {
      if (this.sourceNamePresent(existing, source.name)) {
        skipped.push(source.name);
        continue;
      }

      await this.openCopiedTextComposer();

      // Live Gemini Notebook: title is required + separate from body.
      const title = await registry.tryResolve('copiedTextTitle', {
        timeoutMs: 1_500,
        editable: true,
      });
      if (title) {
        await title.fill(source.name);
      }

      const editor = await registry.resolve('copiedTextInput', { editable: true });
      // Keep filename as first line so UIs without a title field still name the card.
      const payload = title ? source.content : `${source.name}\n\n${source.content}`;
      await editor.fill(payload);

      const confirm = await registry.resolve('confirmAddSource');
      await confirm.click();
      await page.waitForTimeout(1_000);

      const after = await this.readSourceNames();
      if (!this.sourceNamePresent(after, source.name)) {
        await page.waitForTimeout(1_500);
        const retry = await this.readSourceNames();
        if (!this.sourceNamePresent(retry, source.name)) {
          throw await this.fail(
            'UNKNOWN_UI',
            `Added text source but it did not appear in list: ${source.name}` +
              (retry.length ? ` (present: ${retry.join(', ')})` : ''),
            'addTextSources',
          );
        }
        existing.splice(0, existing.length, ...retry);
      } else {
        existing.splice(0, existing.length, ...after);
      }
      added.push(source.name);
    }

    return { added, skipped };
  }

  /** Open Copied-text form; never click Add while a CDK backdrop is intercepting. */
  private async openCopiedTextComposer(): Promise<void> {
    const registry = this.requireSelectors();
    const page = this.requirePage();

    const inputVisible = async (): Promise<boolean> => {
      const el = await registry.tryResolve('copiedTextInput', {
        timeoutMs: 400,
        editable: true,
      });
      return Boolean(el && (await el.isVisible().catch(() => false)));
    };

    if (await inputVisible()) return;

    // Live UI: upload dialog may already be open (backdrop showing).
    if (await this.hasBlockingBackdrop()) {
      const optionInDialog = await registry.tryResolve('copiedTextOption', {
        timeoutMs: 1_500,
      });
      if (optionInDialog && (await optionInDialog.isVisible().catch(() => false))) {
        await optionInDialog.click({ timeout: 8_000 });
        await page.waitForTimeout(300);
        if (await inputVisible()) return;
      }
      // Unknown modal — clear, then open Add ourselves.
      await this.dismissBlockingOverlays();
    }

    const addBtn = await registry.resolve('addSourceButton');
    await addBtn.click({ timeout: 10_000 });
    await page.waitForTimeout(400);

    const option = await registry.tryResolve('copiedTextOption', { timeoutMs: 3_000 });
    if (!option) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        'Copied-text source option not found after opening Add source',
        'addTextSources',
      );
    }
    await option.click({ timeout: 8_000 });
    await page.waitForTimeout(300);
  }

  private async hasBlockingBackdrop(): Promise<boolean> {
    const page = this.requirePage();
    const backdrop = page.locator(
      '.cdk-overlay-backdrop.cdk-overlay-backdrop-showing, .cdk-overlay-backdrop-showing',
    );
    if ((await backdrop.count()) === 0) return false;
    return backdrop.first().isVisible().catch(() => false);
  }

  async setInstructions(text: string): Promise<void> {
    const registry = this.requireSelectors();
    const page = this.requirePage();
    await this.dismissBlockingOverlays();

    let editor = await registry.tryResolve('instructionsEditor', {
      timeoutMs: 800,
      editable: true,
    });

    if (!editor) {
      const configure = await registry.tryResolve('configureNotebookButton', {
        timeoutMs: 3_500,
      });
      if (!configure) {
        throw await this.fail(
          'SELECTOR_NOT_FOUND',
          'Configure notebook/chat button not found',
          'setInstructions',
        );
      }
      await configure.click({ timeout: 8_000 });
      await page.waitForTimeout(500);

      const custom = await registry.tryResolve('customGoalButton', { timeoutMs: 2_500 });
      if (custom) {
        await custom.click({ timeout: 5_000 });
        await page.waitForTimeout(400);
      }

      editor = await registry.resolve('instructionsEditor', {
        timeoutMs: 4_000,
        editable: true,
      });
    }

    await editor.fill(text);
    const save = await registry.tryResolve('saveInstructionsButton', { timeoutMs: 2_000 });
    if (save) await save.click({ timeout: 5_000 });
    await page.waitForTimeout(300);
  }

  async verifySources(expectedNames: string[]): Promise<{
    ok: boolean;
    missing: string[];
    present: string[];
  }> {
    const present = await this.readSourceNames();
    const missing = expectedNames.filter(
      (name) => !this.sourceNamePresent(present, name),
    );
    return { ok: missing.length === 0, missing, present };
  }

  async getNotebookState(): Promise<NotebookState> {
    const available = await this.detectAvailability();
    if (!available) {
      return {
        available: false,
        currentName: null,
        currentUrl: null,
        sourceNames: [],
        instructions: null,
        open: false,
      };
    }

    const page = this.requirePage();
    const registry = this.requireSelectors();
    const currentName = await this.readCurrentNotebookName();
    const instructionsEl = await registry.tryResolve('instructionsEditor');
    const instructions = instructionsEl
      ? await instructionsEl.inputValue().catch(async () => instructionsEl.innerText())
      : null;

    return {
      available: true,
      currentName,
      currentUrl: page.url(),
      sourceNames: await this.readSourceNames(),
      instructions,
      open: currentName !== null,
    };
  }

  /** Inject assisted-setup guide overlay into the page (no CAPTCHA bypass). */
  async showAssistedGuide(message: string): Promise<void> {
    const page = this.requirePage();
    await page.evaluate((text) => {
      let banner = document.querySelector('[data-assisted-guide]');
      if (!banner) {
        banner = document.createElement('div');
        banner.setAttribute('data-assisted-guide', '1');
        banner.setAttribute('data-testid', 'assisted-guide');
        (banner as HTMLElement).style.cssText =
          'position:fixed;z-index:99999;left:0;right:0;top:0;padding:12px 16px;' +
          'background:#1a365d;color:#fff;font:14px/1.4 system-ui;box-shadow:0 2px 8px rgba(0,0,0,.3)';
        document.body.appendChild(banner);
      }
      banner.textContent = text;
    }, message);
  }

  private sourceNamePresent(present: string[], expected: string): boolean {
    const needle = expected.trim().toLowerCase();
    const stem = needle.replace(/\.md$/i, '');
    const stemCore = stem.replace(/^\d+_/, ''); // e.g. book_profile

    return present.some((item) => {
      const hay = item.trim().toLowerCase().replace(/\s+/g, ' ');
      const hayNoExt = hay.replace(/\.md$/i, '');
      if (hay === needle || hayNoExt === stem) return true;
      // Filename stem inside card text (min length avoids "0"/"00" false positives)
      if (stem.length >= 6 && (hay.includes(stem) || hayNoExt.includes(stem))) return true;
      if (
        stemCore.length >= 6 &&
        (hay.includes(stemCore) || hay.includes(stemCore.replace(/_/g, ' ')))
      ) {
        return true;
      }
      // Card text is a long substring of the filename — not short tokens like "0"
      if (hayNoExt.length >= 6 && (stem.includes(hayNoExt) || needle.includes(hayNoExt))) {
        return true;
      }
      return false;
    });
  }

  /** Drive LIVE present = matching stem without .md / copy / (1) upload artifacts. */
  private hasDriveLiveSource(present: string[], expected: string): boolean {
    return hasDriveLivePresence(present, expected);
  }

  /**
   * Best-effort remove of static duplicate source cards.
   * Never throws — failed names returned for NEEDS_MIGRATION.
   */
  async removeSourcesByNames(
    names: string[],
  ): Promise<{ removed: string[]; failed: string[] }> {
    const page = this.requirePage();
    const removed: string[] = [];
    const failed: string[] = [];

    for (const name of names) {
      try {
        const items = this.requireSelectors().sourceItemLocators();
        const count = await items.count();
        let targetIndex = -1;
        for (let i = 0; i < count; i += 1) {
          const item = items.nth(i);
          const label =
            (await item.getAttribute('data-source-name')) ??
            (await item.innerText()).trim();
          if (label === name || this.sourceNamePresent([label], name)) {
            // Prefer exact static name match when possible
            if (label === name || /\.md$/i.test(label) || /\(\d+\)|copy/i.test(label)) {
              targetIndex = i;
              break;
            }
            if (targetIndex < 0) targetIndex = i;
          }
        }
        if (targetIndex < 0) {
          failed.push(name);
          continue;
        }

        const item = items.nth(targetIndex);
        await item.click({ button: 'right', timeout: 3_000 }).catch(async () => {
          await item.click({ timeout: 3_000 });
        });
        await page.waitForTimeout(300);

        const removeBtn = page.locator(
          [
            "button:has-text('Remove')",
            "button:has-text('Delete')",
            "button:has-text('Xóa')",
            "[role='menuitem']:has-text('Remove')",
            "[role='menuitem']:has-text('Xóa')",
            "[data-testid='remove-source']",
          ].join(', '),
        );
        if ((await removeBtn.count()) === 0) {
          failed.push(name);
          await page.keyboard.press('Escape').catch(() => undefined);
          continue;
        }
        await removeBtn.first().click({ timeout: 5_000 });
        await page.waitForTimeout(500);
        const confirm = page.locator(
          "button:has-text('Remove'), button:has-text('Delete'), button:has-text('Xóa')",
        );
        if ((await confirm.count()) > 0) {
          await confirm.first().click({ timeout: 3_000 }).catch(() => undefined);
        }
        removed.push(name);
      } catch {
        failed.push(name);
      }
    }

    return { removed, failed };
  }

  private async dismissBlockingOverlays(): Promise<void> {
    const page = this.requirePage();
    for (let i = 0; i < 5; i += 1) {
      const close = page.locator(
        [
          ".cdk-overlay-container button[aria-label='Close']",
          ".cdk-overlay-container button[aria-label='Đóng']",
          ".cdk-overlay-container button[aria-label*='Close']",
          ".cdk-overlay-container button[aria-label*='Đóng']",
          "button[aria-label='Close']",
          "button[aria-label='Đóng']",
        ].join(', '),
      );
      if ((await close.count()) > 0) {
        const first = close.first();
        if (await first.isVisible().catch(() => false)) {
          await first.click({ force: true }).catch(() => undefined);
          await page.waitForTimeout(200);
          continue;
        }
      }

      if (!(await this.hasBlockingBackdrop())) break;

      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(250);
      if (!(await this.hasBlockingBackdrop())) break;

      const backdrop = page.locator('.cdk-overlay-backdrop-showing').first();
      await backdrop
        .click({ position: { x: 2, y: 2 }, force: true })
        .catch(() => undefined);
      await page.waitForTimeout(250);
    }
  }

  private async readCurrentNotebookName(): Promise<string | null> {
    const page = this.requirePage();
    const registry = this.requireSelectors();
    // Home list pages have random headings — only read title inside a notebook view
    const inNotebookView =
      this.isNotebookDetailUrl(page.url()) ||
      (await page.getByTestId('notebook-title').count()) > 0 ||
      (await page.locator('[data-notebook-title-display]').count()) > 0 ||
      (await page.locator('input.title-input').count()) > 0;
    if (!inNotebookView) return null;

    const input = await registry.tryResolve('notebookTitleInput', { timeoutMs: 400 });
    if (input && (await input.isVisible().catch(() => false))) {
      const value = (await input.inputValue().catch(() => '')).trim();
      if (value) return value;
    }
    const title =  page.getByTestId('notebook-title').first();
    if ((await title.count()) > 0) {
      const text = (await title.innerText().catch(() => '')).trim();
      if (text) return text;
    }
    const display =  page.locator('[data-notebook-title-display]').first();
    if ((await display.count()) > 0) {
      const text = (await display.innerText().catch(() => '')).trim();
      if (text) return text;
    }
    return null;
  }

  private isNotebookDetailUrl(url: string): boolean {
    return /\/notebook\//i.test(url) || /notebook-open\.html/i.test(url);
  }

  async readSourceNames(): Promise<string[]> {
    const items = this.requireSelectors().sourceItemLocators();
    const count = await items.count();
    const names: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const item = items.nth(i);
      const name =
        (await item.getAttribute('data-source-name')) ??
        (await item.innerText()).trim();
      if (name) names.push(name);
    }
    return names;
  }

  private async ensureApp(): Promise<void> {
    const ok = await this.detectAvailability();
    if (!ok) {
      throw await this.fail(
        'SELECTOR_NOT_FOUND',
        'NotebookLM UI not available',
        'detectAvailability',
      );
    }
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new AutomationError('UNKNOWN_UI', 'NotebookProvider not attached');
    }
    return this.page;
  }

  private requireSelectors(): NotebookSelectorRegistry {
    if (!this.selectors) {
      throw new AutomationError('UNKNOWN_UI', 'NotebookProvider selectors not ready');
    }
    return this.selectors;
  }

  private async fail(
    code: 'SELECTOR_NOT_FOUND' | 'UNKNOWN_UI' | 'LOGIN_REQUIRED' | 'RESPONSE_TIMEOUT',
    message: string,
    operation: string,
  ): Promise<AutomationError> {
    const diagnostics = await captureFailureDiagnostics({
      page: this.page,
      diagnosticsDir: this.diagnosticsDir,
      operationName: operation,
      tag: operation,
    });
    return new AutomationError(code, message, diagnostics);
  }
}
