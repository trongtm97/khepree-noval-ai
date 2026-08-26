import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium } from 'playwright';
import { initializeDatabase, closeDatabase, getDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  loadSelectorOverridesFromDisk,
  saveSelectorOverridesToDisk,
  getOverrideForSelector,
  upsertSelectorOverride,
  countOverrides,
  resetSelectorOverrideCacheForTests,
} from '@main/automation/selectors/selector-override-loader';
import { mergeStrategies, describeStrategy } from '@main/automation/selectors/selector-strategy';
import {
  listProviderStatuses,
  recordProviderSuccess,
} from '@main/automation/selectors/provider-status';
import {
  sanitizeHtmlSnapshot,
  redactDiagnosticText,
  captureFailureDiagnostics,
} from '@main/automation/diagnostics';
import {
  buildDiagnosticsExportZip,
  isForbiddenDiagnosticsPath,
} from '@main/automation/diagnostics-export';
import { waitForElementClick } from '@main/automation/interactive-repair';
import { DiagnosticsService } from '@main/services/diagnostics-service';
import { SelectorOverrideFileSchema } from '@shared/schemas/selector-override';

describe('Automation Diagnostics (Phase 19)', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-diag-'));
    pathsService.initializeAt(tempRoot);
    resetSelectorOverrideCacheForTests();
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    resetSelectorOverrideCacheForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('validates selector override JSON and rejects unsafe css', () => {
    const bad = {
      version: 1,
      providers: {
        'google-gemini': {
          selectors: {
            promptInput: {
              strategies: [{ kind: 'css', css: 'textarea; javascript:alert(1)' }],
              mode: 'prepend',
            },
          },
        },
      },
    };
    expect(SelectorOverrideFileSchema.safeParse(bad).success).toBe(false);

    const good = {
      version: 1 as const,
      providers: {
        'google-gemini': {
          selectors: {
            promptInput: {
              strategies: [{ kind: 'css' as const, css: 'textarea[data-prompt]' }],
              mode: 'prepend' as const,
            },
          },
        },
      },
    };
    const parsed = SelectorOverrideFileSchema.parse(good);
    const filePath = saveSelectorOverridesToDisk(parsed);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(getOverrideForSelector('google-gemini', 'promptInput')?.strategies[0]).toEqual({
      kind: 'css',
      css: 'textarea[data-prompt]',
    });
  });

  it('merges override strategies before builtin (fallback)', () => {
    const merged = mergeStrategies(
      [{ kind: 'testId', testId: 'builtin' }],
      [{ kind: 'css', css: '.override' }],
      'prepend',
    );
    expect(describeStrategy(merged[0])).toContain('css=.override');
    expect(describeStrategy(merged[1])).toContain('testId=builtin');
  });

  it('tracks provider version + last successful run', () => {
    const mgr = getDatabase();
    recordProviderSuccess(mgr, 'google-gemini', '2026-08-23T12:00:00.000Z');
    upsertSelectorOverride({
      providerId: 'google-gemini',
      selectorKey: 'sendButton',
      strategies: [{ kind: 'testId', testId: 'send-prompt-v2' }],
    });
    const statuses = listProviderStatuses(mgr);
    const gemini = statuses.find((s) => s.providerId === 'google-gemini');
    expect(gemini?.providerVersion).toBeTruthy();
    expect(gemini?.selectorRegistryVersion).toBeTruthy();
    expect(gemini?.lastSuccessfulRun).toBe('2026-08-23T12:00:00.000Z');
    expect(gemini?.overrideCount).toBe(1);
  });

  it('redacts secrets in HTML snapshots and diagnostic text', () => {
    const html =
      '<html><script>const access_token="secret"</script><body>cookie=abc Bearer xyz<input type="password" value="hunter2"/></body></html>';
    const cleaned = sanitizeHtmlSnapshot(html);
    expect(cleaned).not.toContain('secret');
    expect(cleaned).not.toContain('hunter2');
    expect(cleaned.toLowerCase()).toContain('[redacted]');
    expect(redactDiagnosticText('Authorization: Bearer ya29.abc TOKEN')).toContain('[REDACTED]');
  });

  it('captures SELECTOR_NOT_FOUND diagnostics with title + candidates', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(
      '<html><head><title>Diag Title</title></head><body><main><p>hello</p></main></body></html>',
    );
    const diagDir = path.join(tempRoot, 'diag');
    const result = await captureFailureDiagnostics({
      page,
      diagnosticsDir: diagDir,
      operationName: 'selector:promptInput',
      tag: 'promptInput',
      selectorKey: 'promptInput',
      selectorCandidates: ['css=.missing', 'testId=prompt-input'],
    });
    await browser.close();
    expect(result.pageTitle).toBe('Diag Title');
    expect(result.selectorKey).toBe('promptInput');
    expect(result.selectorCandidates).toEqual(['css=.missing', 'testId=prompt-input']);
    expect(result.screenshotPath && fs.existsSync(result.screenshotPath)).toBe(true);
    expect(result.domFragmentPath && fs.existsSync(result.domFragmentPath)).toBe(true);
  });

  it('exports diagnostics ZIP without forbidden secret paths', async () => {
    expect(isForbiddenDiagnosticsPath('/x/browser-profiles/foo')).toBe(true);
    expect(isForbiddenDiagnosticsPath('/x/oauth/token.json')).toBe(true);

    const autoDir = path.join(pathsService.getPath('cache'), 'automation');
    fs.mkdirSync(autoDir, { recursive: true });
    fs.writeFileSync(path.join(autoDir, 'fail.html'), '<html>cookie=abc Bearer tok</html>');

    const service = new DiagnosticsService(() => getDatabase());
    const report = service.buildHealthReport();
    expect(report.logRedactionEnabled).toBe(true);
    expect(report.providers.length).toBeGreaterThanOrEqual(2);

    const out = path.join(pathsService.getPath('exports'), 'diag.zip');
    const exported = await buildDiagnosticsExportZip({
      healthReport: report,
      automationCacheDir: autoDir,
      logsDir: pathsService.getPath('logs'),
      outputPath: out,
    });
    expect(fs.existsSync(exported.filePath)).toBe(true);
    expect(exported.entryCount).toBeGreaterThan(2);
    expect(exported.excluded.join(' ')).toMatch(/cookie|oauth|token/i);

    const badPath = path.join(tempRoot, 'bad.json');
    fs.writeFileSync(badPath, '{"version":99}');
    const loaded = loadSelectorOverridesFromDisk(badPath);
    expect(loaded.errors.length).toBeGreaterThan(0);
    expect(countOverrides(loaded.file)).toBe(0);
  });

  it('rejects password field suggestions in interactive repair', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(
      '<html><body><input id="pw" type="password" name="password" /><button id="ok" data-testid="send-prompt">Send</button></body></html>',
    );
    const pending = waitForElementClick(page, 5_000);
    await page.waitForTimeout(50);
    await page.click('#pw');
    const suggestion = await pending;
    await browser.close();
    expect(suggestion.rejected).toBe(true);
    expect(suggestion.rejectReason).toMatch(/password/i);
    expect(suggestion.suggestedStrategies).toEqual([]);
  });
});
