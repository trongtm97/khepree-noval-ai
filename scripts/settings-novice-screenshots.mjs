/**
 * Capture Settings tab screenshots at 1366×768 and 1920×1080.
 * Run with NO other Khepree Novel AI instance open (SQLite single-writer).
 *
 *   node scripts/settings-novice-screenshots.mjs
 */
import { _electron as electron } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'settings-novice-screenshots');
const VITE_PORT = 5174;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function startVite() {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'vite',
        '--config',
        'vite.renderer.config.ts',
        '--port',
        String(VITE_PORT),
        '--strictPort',
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    );
    let ready = false;
    const onData = (chunk) => {
      if (!ready && chunk.toString().includes('Local:')) {
        ready = true;
        resolve(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    setTimeout(() => {
      if (!ready) reject(new Error('Vite did not start'));
    }, 60_000);
  });
}

async function shot(page, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await sleep(500);
  const dir = path.join(OUT, `${w}x${h}`);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, file) });
}

async function openTab(page, label) {
  const horiz = page.getByRole('tab', { name: label });
  const side = page.locator('.settings-side-nav__item', { hasText: label });
  if (await horiz.isVisible().catch(() => false)) await horiz.click();
  else await side.first().click();
  await sleep(400);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, '.vite/build/main.js'))) {
    throw new Error('Run npm run dev once to build main/preload bundles first.');
  }

  const vite = await startVite();
  let app;
  try {
    const electronPath = path.join(ROOT, 'node_modules/electron/dist/electron.exe');
    app = await electron.launch({
      executablePath: electronPath,
      args: [ROOT],
      timeout: 180_000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);

    const skip = page.getByRole('button', { name: /Bỏ qua và khám phá|Skip and explore/i });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await sleep(1000);

    await page.getByRole('link', { name: /Cài đặt|Settings/i }).click();
    await page.locator('.settings-page').waitFor({ timeout: 60_000 });

    for (const [w, h] of [
      [1366, 768],
      [1920, 1080],
    ]) {
      for (const [label, file] of [
        ['Language', '01-language-tab.png'],
        ['Dịch thuật', '02-translation-tab.png'],
        ['AI', '03-ai-tab.png'],
        ['Lưu trữ', '04-storage-tab.png'],
      ]) {
        await openTab(page, label);
        await shot(page, w, h, file);
      }
    }
    console.log('OK', OUT);
  } finally {
    if (app) await app.close().catch(() => undefined);
    vite.kill('SIGTERM');
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
