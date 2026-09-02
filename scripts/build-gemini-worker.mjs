/**
 * Build standalone KhepreeNovelAIGeminiWorker.exe (PyInstaller) into resources/workers/.
 *
 * Requires Python 3.11+ with pip on the *build* machine only.
 * End users of the packaged app do not need Python.
 *
 * Usage:
 *   node scripts/build-gemini-worker.mjs
 *   npm run build:gemini-worker
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workerDir = path.join(root, 'workers', 'gemini_webapi_worker');
const outDir = path.join(root, 'resources', 'workers');
const exeName = 'KhepreeNovelAIGeminiWorker.exe';
const distExe = path.join(workerDir, 'dist', exeName);
const targetExe = path.join(outDir, exeName);

function run(cmdParts, opts = {}) {
  const [exe, ...args] = cmdParts;
  console.log(`> ${exe} ${args.join(' ')}`);
  const result = spawnSync(exe, args, {
    cwd: opts.cwd ?? root,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${exe}`);
  }
}

function findPython() {
  const candidates =
    process.platform === 'win32'
      ? [
          ['py', '-3.12'],
          ['py', '-3.11'],
          ['py', '-3'],
          ['python'],
        ]
      : [['python3.12'], ['python3.11'], ['python3'], ['python']];
  for (const parts of candidates) {
    const r = spawnSync(parts[0], [...parts.slice(1), '--version'], {
      encoding: 'utf8',
      shell: false,
    });
    if (r.status === 0) return parts;
  }
  return null;
}

function main() {
  if (process.platform !== 'win32') {
    console.warn('Gemini worker Windows .exe build skipped (not win32).');
    process.exit(0);
  }

  fs.mkdirSync(outDir, { recursive: true });

  if (process.env.NTS_SKIP_WORKER_BUILD === '1' && fs.existsSync(targetExe)) {
    console.log(`Using existing ${targetExe}`);
    return;
  }

  const py = findPython();
  if (!py) {
    console.error(
      'Python 3.11+ required on the build machine to produce KhepreeNovelAIGeminiWorker.exe.',
    );
    process.exit(1);
  }

  run([...py, '-m', 'pip', 'install', '-U', 'pip', 'pyinstaller']);
  run([...py, '-m', 'pip', 'install', '-r', path.join(workerDir, 'requirements.txt')]);

  const spec = path.join(workerDir, 'khepree_novel_ai_gemini_worker.spec');
  run([...py, '-m', 'PyInstaller', '--noconfirm', '--clean', spec], {
    cwd: workerDir,
  });

  if (!fs.existsSync(distExe)) {
    throw new Error(`Expected build output missing: ${distExe}`);
  }

  try {
    if (fs.existsSync(targetExe)) fs.unlinkSync(targetExe);
  } catch {
    // Best-effort unlock; copy may still work after rebuild.
  }
  fs.copyFileSync(distExe, targetExe);
  console.log(`Wrote ${targetExe} (${fs.statSync(targetExe).size} bytes)`);
}

main();
