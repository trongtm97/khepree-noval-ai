/**
 * Settings novice acceptance — screenshots + click walkthrough + persistence probe.
 * Run: node scripts/settings-novice-acceptance.mjs
 */
import { _electron as electron } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'settings-novice-screenshots');
const RENDERER_OUT = path.join(ROOT, '.vite/renderer/main_window');

const FORBIDDEN = [
  'provider priority',
  'worker ID',
  'perProviderMax',
  '__Secure',
  'Client ID',
  'OAuth',
  'Google Drive',
  'Notebook grounding',
  'correlation ID',
  'JSON',
  'workerInstalled',
  'provider_',
  'PID',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureRendererBuild() {
  const indexPath = path.join(RENDERER_OUT, 'index.html');
  if (fs.existsSync(indexPath)) return;
  await new Promise((resolve, reject) => {
    const proc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'vite',
        'build',
        '--config',
        'vite.renderer.config.ts',
        '--outDir',
        '../../.vite/renderer/main_window',
      ],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    proc.on('exit', (code) => {
      if (code === 0 && fs.existsSync(indexPath)) resolve(undefined);
      else reject(new Error(`Renderer build failed (code ${code ?? 'unknown'})`));
    });
    proc.on('error', reject);
  });
}

async function capture(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await sleep(400);
  const dir = path.join(OUT_DIR, `${width}x${height}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function visibleText(page) {
  return page.evaluate(() => document.body?.innerText ?? '');
}

async function bootstrapApp(page) {
  await page.waitForFunction(() => Boolean(window.novelTrans?.setup?.explore), undefined, {
    timeout: 90_000,
  });
  const skipExplore = page.getByRole('button', { name: /Bỏ qua và khám phá|Skip and explore/i });
  if (await skipExplore.isVisible().catch(() => false)) {
    await skipExplore.click();
    await sleep(1200);
  }
  await page.waitForFunction(
    () => Boolean(document.querySelector('a[href="/settings"]')),
    undefined,
    { timeout: 90_000 },
  );
  await sleep(800);
}

async function openSettingsTab(page, _tabId, tabLabel) {
  const onSettings = await page.locator('.settings-page').isVisible().catch(() => false);
  if (!onSettings) {
    await page.locator('a[href="/settings"]').first().click();
    await page.locator('.settings-page').waitFor({ timeout: 30_000 });
  }
  const horizontalTab = page.getByRole('tab', { name: tabLabel });
  const sideNavItem = page.locator('.settings-side-nav__item', { hasText: tabLabel });
  if (await horizontalTab.isVisible().catch(() => false)) {
    await horizontalTab.click();
  } else {
    await sideNavItem.first().click();
  }
  await sleep(500);
}

async function clickCountScenario(page, clicks) {
  const bump = (n = 1, label) => {
    clicks.total += n;
    if (label) clicks.steps.push({ label, count: n });
  };

  await openSettingsTab(page, 'language', 'Language');
  bump(1, 'Open Settings (sidebar link)');
  bump(1, 'Open Language tab');

  await page.locator('.ui-locale-picker .language-picker-trigger').waitFor({ timeout: 30_000 });
  bump(1, 'Open UI locale picker');
  await page.getByRole('option', { name: /English/i }).click();
  bump(1, 'Select English UI');
  await sleep(600);

  // Default target -> Japanese (picker + selection)
  await page
    .locator('.settings-content .language-picker:not(.ui-locale-picker) .language-picker-trigger')
    .click();
  bump(1, 'Open default target language picker');
  await page.getByRole('option', { name: /Japanese|Tiếng Nhật|日本語/i }).click();
  bump(1, 'Select Japanese target');
  await sleep(600);

  // Return Vietnamese UI
  await page.locator('.ui-locale-picker .language-picker-trigger').click();
  bump(1, 'Open UI locale picker (back to VI)');
  await page.getByRole('option', { name: /Tiếng Việt|Vietnamese/i }).click();
  bump(1, 'Select Vietnamese UI');
  await sleep(600);

  // Translation AUTO
  await openSettingsTab(page, 'translation', 'Dịch thuật');
  bump(1, 'Open Translation tab');
  const autoRadio = page.getByRole('radio', { name: /Tự động|Automatic/i });
  if (await autoRadio.isVisible().catch(() => false)) {
    const checked = await autoRadio.isChecked().catch(() => true);
    if (!checked) {
      await autoRadio.click();
      bump(1, 'Select AUTO translation mode');
    }
  }
  const optimizeBtn = page.getByRole('button', { name: /Tối ưu tự động|Optimize automatically/i });
  if (await optimizeBtn.isVisible().catch(() => false)) {
    await optimizeBtn.click();
    bump(1, 'Optimize translation (1-click action)');
  }
  await sleep(400);

  // AI auto setup — 1 click (may require login; skip if blocked)
  await openSettingsTab(page, 'ai', 'AI');
  bump(1, 'Open AI tab');
  const aiBtn = page.getByRole('button', { name: /Kiểm tra & sửa tự động|Check & fix automatically/i });
  if (await aiBtn.isVisible().catch(() => false)) {
    await aiBtn.click();
    bump(1, 'Run AI check & auto-fix');
    await sleep(2500);
  }

  // Storage root via IPC (folder dialog not automatable headless)
  await openSettingsTab(page, 'storage', 'Lưu trữ');
  bump(1, 'Open Storage tab');
  const storageRoot = path.join(os.tmpdir(), 'nts-novice-storage');
  fs.mkdirSync(storageRoot, { recursive: true });
  await page.evaluate(async (root) => {
    await window.novelTrans.portability.setupStorageRoot({ root });
  }, storageRoot);
  bump(1, 'Storage root setup (1 button equivalent via IPC — OS folder picker +1 in manual flow)');

  return { storageRoot };
}

async function readPersisted(page) {
  return page.evaluate(async () => {
    const localeRaw = localStorage.getItem('noveltrans-locale');
    const locale = localeRaw ? JSON.parse(localeRaw) : null;
    const translation = await window.novelTrans.translationSettings.get();
    const scheduler = await window.novelTrans.jobs.getSchedulerSettings();
    const exportDir = await window.novelTrans.portability.getDefaultExportDirectory();
    const backupDir = await window.novelTrans.portability.getBackupDirectory();
    return {
      locale,
      defaultTargetLanguage: translation.defaultTargetLanguage,
      globalMaxWorkers: scheduler.globalMaxWorkers,
      exportDirectory: exportDir.directory,
      backupDirectory: backupDir.directory,
    };
  });
}

async function auditVisibleJargon(text) {
  const hits = [];
  const lower = text.toLowerCase();
  for (const term of FORBIDDEN) {
    if (lower.includes(term.toLowerCase())) hits.push(term);
  }
  return hits;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const userData = path.join(os.tmpdir(), `nts-novice-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });

  await ensureRendererBuild();
  const rendererIndex = path.join(RENDERER_OUT, 'index.html');
  if (!fs.existsSync(rendererIndex)) {
    throw new Error(`Missing renderer build at ${rendererIndex}`);
  }

  let app;
  const report = {
    ranAt: new Date().toISOString(),
    userData,
    clicks: { total: 0, steps: [] },
    screenshots: {},
    jargon: {},
    persistence: {},
    errors: [],
  };

  try {
    const electronPath = path.join(
      ROOT,
      'node_modules',
      'electron',
      'dist',
      process.platform === 'win32' ? 'electron.exe' : 'electron',
    );

    app = await electron.launch({
      executablePath: electronPath,
      args: [ROOT, `--user-data-dir=${userData}`],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
      timeout: 180_000,
    });

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    await bootstrapApp(page);

    const { storageRoot } = await clickCountScenario(page, report.clicks);
    report.storageRoot = storageRoot;

    const afterFirst = await readPersisted(page);
    report.persistence.afterScenario = afterFirst;

    for (const [w, h] of [
      [1366, 768],
      [1920, 1080],
    ]) {
      await openSettingsTab(page, 'language', 'Language');
      report.screenshots[`language-${w}x${h}`] = await capture(page, '01-language-tab', w, h);

      await openSettingsTab(page, 'translation', 'Dịch thuật');
      report.screenshots[`translation-${w}x${h}`] = await capture(page, '02-translation-tab', w, h);

      await openSettingsTab(page, 'ai', 'AI');
      report.screenshots[`ai-${w}x${h}`] = await capture(page, '03-ai-tab', w, h);

      await openSettingsTab(page, 'storage', 'Lưu trữ');
      report.screenshots[`storage-${w}x${h}`] = await capture(page, '04-storage-tab', w, h);
    }

    for (const [tab, label] of [
      ['language', 'Language'],
      ['translation', 'Dịch thuật'],
      ['ai', 'AI'],
      ['storage', 'Lưu trữ'],
    ]) {
      await openSettingsTab(page, tab, label);
      await sleep(400);
      const text = await visibleText(page);
      report.jargon[tab] = await auditVisibleJargon(text);
    }

    await app.close();
    app = null;

    app = await electron.launch({
      executablePath: electronPath,
      args: [ROOT, `--user-data-dir=${userData}`],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
      timeout: 180_000,
    });

    const page2 = await app.firstWindow();
    await page2.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    await bootstrapApp(page2);
    report.persistence.afterRestart = await readPersisted(page2);

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => undefined);
  }
}

void main();
