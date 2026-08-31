/**
 * Packaged smoke for Browser Runner (utilityProcess).
 *
 * Usage:
 *   node scripts/smoke-runner-packaged.mjs
 *   node scripts/smoke-runner-packaged.mjs --skip-package
 *
 * Reads NTS_SMOKE_REPORT_PATH JSON (Windows GUI exe has unreliable stdout).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const skipPackage = process.argv.includes('--skip-package');
const reportPath = path.join(os.tmpdir(), `nts-smoke-runner-${Date.now()}.json`);

function findPackagedExe() {
  const outDir = path.join(root, 'out');
  if (!fs.existsSync(outDir)) return null;
  const candidates = [];
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (name === 'KhepreeNovelAI.exe') candidates.push(full);
    }
  };
  walk(outDir);
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      ...opts,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString();
      process.stdout.write(c);
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
      process.stderr.write(c);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function readReport() {
  try {
    if (!fs.existsSync(reportPath)) return null;
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  if (!skipPackage) {
    console.log('[smoke] npm run package…');
    const pkg = await run('npm', ['run', 'package']);
    if (pkg.code !== 0) {
      console.error('[smoke] package FAILED');
      process.exit(pkg.code);
    }
  }

  const exe = findPackagedExe();
  if (!exe) {
    console.error('[smoke] KhepreeNovelAI.exe not found under out/');
    process.exit(1);
  }
  console.log(`[smoke] exe=${exe}`);
  console.log(`[smoke] report=${reportPath}`);

  try {
    fs.unlinkSync(reportPath);
  } catch {
    // ignore
  }

  const result = await new Promise((resolve, reject) => {
    const child = spawn(exe, ['--nts-smoke-runner'], {
      cwd: path.dirname(exe),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NTS_SMOKE_REPORT_PATH: reportPath,
        ELECTRON_ENABLE_LOGGING: '1',
      },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString();
      process.stdout.write(c);
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
      process.stderr.write(c);
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ code: 124, stdout, stderr, timedOut: true });
    }, 120_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut: false });
    });
  });

  const report = readReport();
  console.log('[smoke] report file:', report);

  const pass =
    report?.ok === true ||
    (result.code === 0 && String(result.stdout).includes('SMOKE_RUNNER_PASS'));

  if (pass) {
    console.log('[smoke] packaged PASS');
    process.exit(0);
  }

  console.error('[smoke] packaged FAIL', {
    code: result.code,
    timedOut: result.timedOut,
    report,
  });
  process.exit(result.code || 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
