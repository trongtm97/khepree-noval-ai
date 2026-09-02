/**
 * Packaged / clean-machine style checks for Windows runtime deps.
 *
 * Does not require Node/Python on the *end-user* machine — validates the
 * packaged layout and BrowserDependencyHealth rules.
 *
 * Usage:
 *   node scripts/smoke-windows-runtime-deps.mjs
 *   node scripts/smoke-windows-runtime-deps.mjs --skip-package
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const skipPackage = process.argv.includes('--skip-package');

function findPackagedDir() {
  const outDir = path.join(root, 'out');
  if (!fs.existsSync(outDir)) return null;
  const dirs = [];
  for (const name of fs.readdirSync(outDir)) {
    const full = path.join(outDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    const exe = path.join(full, 'KhepreeNovelAI.exe');
    if (fs.existsSync(exe)) dirs.push(full);
  }
  dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function edgeOrChromePresent() {
  const env = process.env;
  const pf = env.ProgramFiles ?? 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA ?? '';
  const candidates = [
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  if (local) {
    candidates.push(path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  return candidates.some((p) => fs.existsSync(p));
}

async function main() {
  const failures = [];

  if (!skipPackage) {
    console.log('[runtime-deps] npm run package…');
    const code = await run('npm', ['run', 'package']);
    if (code !== 0) {
      console.error('[runtime-deps] package failed');
      process.exit(1);
    }
  }

  const appDir = findPackagedDir();
  if (!appDir) {
    console.error('[runtime-deps] No packaged KhepreeNovelAI.exe under out/');
    process.exit(1);
  }
  console.log('[runtime-deps] packaged dir:', appDir);

  const resourcesWorkers = path.join(appDir, 'resources', 'workers');
  const workerExe = path.join(resourcesWorkers, 'KhepreeNovelAIGeminiWorker.exe');
  const guides = path.join(appDir, 'resources', 'guides');

  if (!fs.existsSync(guides)) {
    failures.push('resources/guides missing from packaged app');
  }

  // Worker exe optional — warn only
  if (!fs.existsSync(workerExe)) {
    console.warn(
      '[runtime-deps] WARN: KhepreeNovelAIGeminiWorker.exe not packaged — Web API optional. Run npm run build:gemini-worker before package for full self-contained Web API.',
    );
  } else {
    console.log('[runtime-deps] bundled worker OK:', workerExe);
  }

  // Secrets / source must not ship under resources/workers
  if (fs.existsSync(resourcesWorkers)) {
    for (const name of fs.readdirSync(resourcesWorkers)) {
      if (name === '.venv' || name.endsWith('.py') || name === '.env') {
        failures.push(`resources/workers must not include ${name}`);
      }
    }
  }

  // Unit-level health: prefer Edge/Chrome; never require npx messaging
  const healthMod = path.join(
    root,
    'src/main/automation/browser-runner/browser-dependency-health.ts',
  );
  // Run via vitest-friendly assert in-process using compiled logic through dynamic import of built tests is heavy —
  // instead re-check filesystem contract matching BrowserDependencyHealth.
  const browserOk = edgeOrChromePresent();
  if (browserOk) {
    console.log('[runtime-deps] Edge/Chrome present → Browser provider expected usable');
  } else {
    console.warn(
      '[runtime-deps] WARN: no Edge/Chrome on this machine — Browser provider may be unavailable (app must still open)',
    );
  }

  // Ensure user-facing strings never mention npx in health module source
  const healthSrc = fs.readFileSync(healthMod, 'utf8');
  if (/npx playwright/i.test(healthSrc)) {
    failures.push('browser-dependency-health.ts must not mention npx playwright');
  }
  const accountSrc = fs.readFileSync(
    path.join(root, 'src/main/services/account-worker-service.ts'),
    'utf8',
  );
  if (/npx playwright/i.test(accountSrc)) {
    failures.push('account-worker-service.ts must not mention npx playwright');
  }

  // App exe exists (clean user can double-click)
  const exe = path.join(appDir, 'KhepreeNovelAI.exe');
  if (!fs.existsSync(exe)) failures.push('KhepreeNovelAI.exe missing');

  // Playwright modules live inside app.asar (copied by packageAfterCopy)
  let playwrightFound = false;
  const asarPath = path.join(appDir, 'resources', 'app.asar');
  if (fs.existsSync(asarPath)) {
    try {
      const asar = await import('@electron/asar');
      const listing = asar.listPackage(asarPath);
      playwrightFound = listing.some(
        (entry) =>
          entry.replace(/\\/g, '/').includes('node_modules/playwright/') ||
          entry.replace(/\\/g, '/').endsWith('node_modules/playwright'),
      );
    } catch (err) {
      console.warn('[runtime-deps] asar list failed', err instanceof Error ? err.message : err);
    }
  }
  if (!playwrightFound) {
    const candidates = [
      path.join(appDir, 'resources', 'app', 'node_modules', 'playwright', 'package.json'),
      path.join(
        appDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'playwright',
        'package.json',
      ),
    ];
    playwrightFound = candidates.some((p) => fs.existsSync(p));
  }
  if (!playwrightFound) {
    failures.push('playwright package not found in packaged tree');
  } else {
    console.log('[runtime-deps] playwright present in package');
  }

  const report = {
    ok: failures.length === 0,
    appDir,
    workerBundled: fs.existsSync(workerExe),
    browserLikelyUsable: browserOk,
    failures,
    host: os.hostname(),
    at: new Date().toISOString(),
  };
  const reportPath = path.join(os.tmpdir(), 'nts-smoke-runtime-deps.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('[runtime-deps] report:', reportPath);

  if (failures.length) {
    console.error('[runtime-deps] FAIL', failures);
    process.exit(1);
  }
  console.log('[runtime-deps] PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
