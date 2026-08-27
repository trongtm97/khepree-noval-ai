import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { GEMINI_WEBAPI_DEFAULT_PORT } from '@shared/constants/ai-provider';
import { isSupportedPythonVersionOutput, pythonDetectCommands } from './python-detect';
import { logger } from '../logging/logger';
import { pathsService } from '../services/paths-service';

export type WorkerLaunchMode = 'bundled_exe' | 'python_venv' | 'missing';

export interface WorkerInstallStatus {
  ok: boolean;
  message: string;
  /** Python interpreter OR bundled worker executable path. */
  pythonPath: string | null;
  venvPath: string | null;
  workerScript: string | null;
  mode: WorkerLaunchMode;
}

export interface WorkerRuntimeStatus {
  running: boolean;
  port: number;
  secret: string;
  baseUrl: string;
  lastError: string | null;
  installed: boolean;
  message: string;
  mode: WorkerLaunchMode;
}

export const BUNDLED_WORKER_EXE_NAME = 'NovelTransGeminiWorker.exe';

/**
 * Spawns / monitors the Gemini Web API worker on 127.0.0.1.
 *
 * Production (packaged): prefer standalone Windows exe under resources/workers.
 * Development: Python 3.11+ + venv under userData.
 */
export class WorkerProcessManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private secret: string = randomBytes(24).toString('hex');
  private port = GEMINI_WEBAPI_DEFAULT_PORT;
  private lastError: string | null = null;
  private intentionalStop = false;

  getSecret(): string {
    return this.secret;
  }

  getPort(): number {
    return this.port;
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  getStatus(): WorkerRuntimeStatus {
    const install = this.detectInstall();
    return {
      running: this.isRunning(),
      port: this.port,
      secret: this.secret,
      baseUrl: this.getBaseUrl(),
      lastError: this.lastError,
      installed: install.ok,
      mode: install.mode,
      message: install.ok
        ? this.isRunning()
          ? 'Gemini Web API worker đang chạy.'
          : install.mode === 'bundled_exe'
            ? 'Worker đóng gói sẵn sàng (chưa chạy).'
            : 'Worker đã cài nhưng chưa chạy.'
        : install.message,
    };
  }

  /** Prefer production bundled exe when present. */
  bundledWorkerExePath(): string | null {
    const candidates = [
      path.join(process.resourcesPath ?? '', 'workers', BUNDLED_WORKER_EXE_NAME),
      path.join(process.cwd(), 'resources', 'workers', BUNDLED_WORKER_EXE_NAME),
      path.join(__dirname, '..', '..', '..', 'resources', 'workers', BUNDLED_WORKER_EXE_NAME),
    ];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  workerRoot(): string {
    // Dev: repo workers/; packaged source fallback (optional).
    const candidates = [
      path.join(process.cwd(), 'workers', 'gemini_webapi_worker'),
      path.join(__dirname, '..', '..', '..', 'workers', 'gemini_webapi_worker'),
      path.join(process.resourcesPath ?? '', 'workers', 'gemini_webapi_worker'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'main.py'))) {
        return candidate;
      }
    }
    return candidates[0]!;
  }

  venvDir(): string {
    return path.join(pathsService.getPath('data'), 'gemini-webapi-venv');
  }

  isPackagedRuntime(): boolean {
    if (process.env.NTS_FORCE_BUNDLED_WORKER === '1') return true;
    if (process.env.NTS_FORCE_PYTHON_WORKER === '1') return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as { app?: { isPackaged?: boolean } };
      return Boolean(electron.app?.isPackaged);
    } catch {
      return Boolean(process.resourcesPath && !process.defaultApp);
    }
  }

  detectPython(): string | null {
    for (const cmd of pythonDetectCommands()) {
      try {
        const parts = fs.existsSync(cmd) ? [cmd] : cmd.split(' ');
        const result = spawnSyncCapture(parts[0]!, [...parts.slice(1), '--version']);
        if (result.ok && isSupportedPythonVersionOutput(result.stdout + result.stderr)) {
          return cmd;
        }
      } catch {
        // try next
      }
    }
    return null;
  }

  detectInstall(): WorkerInstallStatus {
    const bundled = this.bundledWorkerExePath();
    if (bundled) {
      return {
        ok: true,
        message: 'Gemini Web API worker đóng gói sẵn sàng.',
        pythonPath: bundled,
        venvPath: null,
        workerScript: null,
        mode: 'bundled_exe',
      };
    }

    if (this.isPackagedRuntime()) {
      return {
        ok: false,
        message:
          'Gemini Web API worker chưa có trong bản cài này. App vẫn chạy được với Gemini Browser (Playwright). Liên hệ bản phát hành có NovelTransGeminiWorker.exe nếu cần Web API.',
        pythonPath: null,
        venvPath: null,
        workerScript: null,
        mode: 'missing',
      };
    }

    const workerScript = path.join(this.workerRoot(), 'main.py');
    if (!fs.existsSync(workerScript)) {
      return {
        ok: false,
        message: 'Chưa cài thành phần Gemini Web API (thiếu worker script).',
        pythonPath: null,
        venvPath: null,
        workerScript: null,
        mode: 'missing',
      };
    }

    const venvPython = this.venvPythonPath();
    if (fs.existsSync(venvPython)) {
      return {
        ok: true,
        message: 'Gemini Web API worker sẵn sàng.',
        pythonPath: venvPython,
        venvPath: this.venvDir(),
        workerScript,
        mode: 'python_venv',
      };
    }

    const systemPython = this.detectPython();
    if (!systemPython) {
      return {
        ok: false,
        message:
          'Dev: cần Python 3.11+ rồi «Cài worker». Production dùng worker .exe đóng gói — không cần Python trên máy người dùng.',
        pythonPath: null,
        venvPath: this.venvDir(),
        workerScript,
        mode: 'missing',
      };
    }

    return {
      ok: false,
      message: 'Python đã có nhưng chưa tạo venv worker. Bấm «Cài worker».',
      pythonPath: systemPython,
      venvPath: this.venvDir(),
      workerScript,
      mode: 'missing',
    };
  }

  venvPythonPath(): string {
    const venv = this.venvDir();
    return process.platform === 'win32'
      ? path.join(venv, 'Scripts', 'python.exe')
      : path.join(venv, 'bin', 'python');
  }

  async install(): Promise<WorkerInstallStatus> {
    const bundled = this.bundledWorkerExePath();
    if (bundled) {
      return this.detectInstall();
    }

    if (this.isPackagedRuntime()) {
      return {
        ok: false,
        message:
          'Bản cài đặt không kèm Gemini Web API worker. Không cần (và không thể) cài Python trên máy người dùng — dùng Gemini Browser hoặc cài bản có NovelTransGeminiWorker.exe.',
        pythonPath: null,
        venvPath: null,
        workerScript: null,
        mode: 'missing',
      };
    }

    const systemPython = this.detectPython();
    if (!systemPython) {
      return {
        ok: false,
        message: 'Không tìm thấy Python 3.11+. Cài Python rồi thử lại (chỉ môi trường phát triển).',
        pythonPath: null,
        venvPath: null,
        workerScript: path.join(this.workerRoot(), 'main.py'),
        mode: 'missing',
      };
    }

    const venv = this.venvDir();
    fs.mkdirSync(venv, { recursive: true });
    const req = path.join(this.workerRoot(), 'requirements.txt');

    const venvResult = await runCommand(systemPython, ['-m', 'venv', venv]);
    if (!venvResult.ok) {
      return {
        ok: false,
        message: `Tạo venv thất bại: ${venvResult.stderr || venvResult.stdout}`,
        pythonPath: systemPython,
        venvPath: venv,
        workerScript: path.join(this.workerRoot(), 'main.py'),
        mode: 'missing',
      };
    }

    const pip = this.venvPythonPath();
    const pipResult = await runCommand(pip, ['-m', 'pip', 'install', '-r', req]);
    if (!pipResult.ok) {
      return {
        ok: false,
        message: `Cài dependency thất bại: ${pipResult.stderr || pipResult.stdout}`,
        pythonPath: pip,
        venvPath: venv,
        workerScript: path.join(this.workerRoot(), 'main.py'),
        mode: 'missing',
      };
    }

    return this.detectInstall();
  }

  async ensureStarted(): Promise<WorkerRuntimeStatus> {
    const install = this.detectInstall();
    if (!install.ok || !install.pythonPath) {
      return this.getStatus();
    }
    if (this.isRunning()) {
      // Managed child may be stale while an orphan still owns the port with an old secret.
      const healthy = await probeHealth(this.getBaseUrl(), this.secret, 1_500);
      if (healthy) return this.getStatus();
      logger.warn('Managed Gemini worker unhealthy — reclaiming port and restarting');
      await this.stop();
    }
    await this.start();
    return this.getStatus();
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      const healthy = await probeHealth(this.getBaseUrl(), this.secret, 1_500);
      if (healthy) return;
      await this.stop();
    }

    const install = this.detectInstall();
    if (!install.ok || !install.pythonPath) {
      this.lastError = install.message;
      throw new Error(install.message);
    }

    // Orphan NovelTransGeminiWorker after app restart keeps port + old secret → HTTP 401.
    await this.reclaimPort('before-start');

    this.intentionalStop = false;
    this.secret = randomBytes(24).toString('hex');

    try {
      await this.spawnWorker(install);
      await this.waitUntilHealthyOrExit(
        install.mode === 'bundled_exe' ? 45_000 : 20_000,
      );
      this.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Bind race / leftover listener: kill again and retry once with a fresh secret.
      if (/HTTP 401|EADDRINUSE|10048|ECONNREFUSED|timeout|exited/i.test(message)) {
        logger.warn('Gemini worker start failed — reclaim port and retry once', { message });
        await this.stop();
        await this.reclaimPort('retry-after-health-fail');
        this.intentionalStop = false;
        this.secret = randomBytes(24).toString('hex');
        await this.spawnWorker(install);
        await this.waitUntilHealthyOrExit(
          install.mode === 'bundled_exe' ? 45_000 : 20_000,
        );
        this.lastError = null;
        return;
      }
      this.lastError = message;
      throw error;
    }
  }

  private async waitUntilHealthyOrExit(timeoutMs: number): Promise<void> {
    const child = this.child;
    if (!child) {
      throw new Error('Worker process missing after spawn');
    }

    let exitCode: number | null | undefined;
    let exitSignal: NodeJS.Signals | null = null;
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      exitCode = code;
      exitSignal = signal;
    };
    child.once('exit', onExit);

    const started = Date.now();
    let lastErr = 'timeout';
    try {
      while (Date.now() - started < timeoutMs) {
        if (exitCode !== undefined || this.child !== child) {
          throw new Error(
            `Worker exited before healthy (code=${exitCode ?? 'null'}, signal=${exitSignal})`,
          );
        }
        try {
          const res = await fetch(`${this.getBaseUrl()}/health`, {
            headers: { 'X-NTS-Secret': this.secret },
          });
          if (res.ok) return;
          lastErr = `HTTP ${res.status}`;
          // Wrong secret on an orphan that outlived our child — fail fast to reclaim.
          if (res.status === 401 && !this.isRunning()) {
            throw new Error(`Worker health check failed: ${lastErr}`);
          }
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message.startsWith('Worker exited') ||
              error.message.startsWith('Worker health check failed'))
          ) {
            throw error;
          }
          lastErr = error instanceof Error ? error.message : String(error);
        }
        await sleep(400);
      }
      throw new Error(`Worker health check failed: ${lastErr}`);
    } finally {
      child.removeListener('exit', onExit);
    }
  }

  private async spawnWorker(install: WorkerInstallStatus): Promise<void> {
    if (!install.pythonPath) {
      throw new Error(install.message || 'Worker binary missing');
    }

    const env = {
      ...process.env,
      NTS_GEMINI_WORKER_SECRET: this.secret,
      NTS_GEMINI_WORKER_HOST: '127.0.0.1',
      NTS_GEMINI_WORKER_PORT: String(this.port),
      PYTHONUNBUFFERED: '1',
    };

    if (install.mode === 'bundled_exe') {
      const exe = install.pythonPath;
      logger.info('Starting bundled Gemini Web API worker', { port: this.port, exe });
      const child = spawn(exe, [], {
        cwd: path.dirname(exe),
        env,
        windowsHide: true,
      });
      this.attachChild(child);
      return;
    }

    if (!install.workerScript) {
      this.lastError = 'Thiếu worker script.';
      throw new Error(this.lastError);
    }

    const python = install.pythonPath;
    const args =
      python.includes(' ') && !fs.existsSync(python)
        ? []
        : [install.workerScript];

    const executable = fs.existsSync(python) ? python : python.split(' ')[0]!;
    const spawnArgs = fs.existsSync(python)
      ? [install.workerScript]
      : [...python.split(' ').slice(1), install.workerScript];

    logger.info('Starting Gemini Web API worker (Python)', { port: this.port });

    const child = spawn(executable, spawnArgs.length ? spawnArgs : args, {
      cwd: this.workerRoot(),
      env,
      windowsHide: true,
    });
    this.attachChild(child);
  }

  /** Kill leftover listeners on our port (orphans after crash / hot-reload). */
  async reclaimPort(reason: string): Promise<void> {
    const keepPid = this.child?.pid ?? null;
    const killed = await killOrphanWorkersOnPort(this.port, keepPid);
    if (killed.length > 0) {
      logger.warn('Reclaimed Gemini Web API worker port', {
        port: this.port,
        reason,
        killed,
      });
      await sleep(400);
    }
  }

  private attachChild(child: ChildProcessWithoutNullStreams): void {
    this.child = child;

    child.stdout.on('data', (buf: Buffer) => {
      const line = buf.toString('utf8').trim();
      if (line) logger.info(`[gemini-worker] ${redact(line)}`);
    });
    child.stderr.on('data', (buf: Buffer) => {
      const line = buf.toString('utf8').trim();
      if (line) logger.warn(`[gemini-worker] ${redact(line)}`);
    });
    child.on('exit', (code, signal) => {
      logger.warn('Gemini Web API worker exited', { code, signal });
      this.child = null;
      if (!this.intentionalStop) {
        this.lastError = `Worker dừng (code=${code})`;
      }
    });
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    if (this.child) {
      const child = this.child;
      try {
        child.kill();
      } catch {
        // ignore
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        }, 3_000);
        child.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
      this.child = null;
    }
    // Windows often leaves the .exe listening after Electron reloads — force free port.
    await this.reclaimPort('stop');
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}

function redact(line: string): string {
  return line
    .replace(/__Secure-1PSID[^=\s]*=\S+/gi, '__Secure-1PSID=***')
    .replace(/PSIDTS?[=:]\s*\S+/gi, 'PSID=***')
    .replace(/cookie[=:]\s*\S+/gi, 'cookie=***');
}

function spawnSyncCapture(
  command: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8_000,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

function runCommand(
  command: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const parts = command.includes(' ') && !fs.existsSync(command) ? command.split(' ') : [command];
    const exe = parts[0]!;
    const prefix = parts.slice(1);
    const child = spawn(exe, [...prefix, ...args], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8');
    });
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString('utf8');
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ ok: false, stdout, stderr: err.message });
    });
  });
}

async function waitForHealth(baseUrl: string, secret: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastErr = 'timeout';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        headers: { 'X-NTS-Secret': secret },
      });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
    }
    await sleep(400);
  }
  throw new Error(`Worker health check failed: ${lastErr}`);
}

async function probeHealth(
  baseUrl: string,
  secret: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await waitForHealth(baseUrl, secret, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse `netstat -ano` LISTENING rows for a TCP port → PIDs. */
export function parseWindowsNetstatListeningPids(
  output: string,
  port: number,
): number[] {
  const pids = new Set<number>();
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !/LISTENING/i.test(line)) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    // TCP  127.0.0.1:18765  0.0.0.0:0  LISTENING  26232
    if (parts.length < 5) continue;
    const local = parts[1]!;
    const portText = local.includes(']:')
      ? local.slice(local.lastIndexOf(']:') + 2)
      : local.slice(local.lastIndexOf(':') + 1);
    if (Number(portText) !== port) continue;
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/** Parse `lsof -iTCP:port -sTCP:LISTEN -n -P -t` PID lines. */
export function parseLsofListeningPids(output: string): number[] {
  const pids = new Set<number>();
  for (const raw of output.split(/\r?\n/)) {
    const pid = Number(raw.trim());
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

async function listPidsListeningOnPort(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const result = spawnSyncCapture('netstat', ['-ano', '-p', 'tcp']);
    return parseWindowsNetstatListeningPids(result.stdout + result.stderr, port);
  }
  const result = spawnSyncCapture('lsof', [
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-n',
    '-P',
    '-t',
  ]);
  return parseLsofListeningPids(result.stdout + result.stderr);
}

function forceKillPid(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const result = spawnSyncCapture('taskkill', ['/PID', String(pid), '/F', '/T']);
      return result.ok;
    }
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

function killBundledWorkerByImageName(keepPid: number | null): number[] {
  if (process.platform !== 'win32') return [];
  // tasklist CSV: "NovelTransGeminiWorker.exe","1234",...
  const listed = spawnSyncCapture('tasklist', [
    '/FI',
    `IMAGENAME eq ${BUNDLED_WORKER_EXE_NAME}`,
    '/FO',
    'CSV',
    '/NH',
  ]);
  const killed: number[] = [];
  const blob = listed.stdout + listed.stderr;
  for (const raw of blob.split(/\r?\n/)) {
    const m = raw.match(/"([^"]+)","(\d+)"/);
    if (!m) continue;
    if (m[1]!.toLowerCase() !== BUNDLED_WORKER_EXE_NAME.toLowerCase()) continue;
    const pid = Number(m[2]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (keepPid != null && pid === keepPid) continue;
    if (forceKillPid(pid)) killed.push(pid);
  }
  return killed;
}

/**
 * Free Gemini worker port held by orphans (not the currently managed child).
 * Prefer port listeners; on Windows also sweep NovelTransGeminiWorker.exe.
 */
export async function killOrphanWorkersOnPort(
  port: number,
  keepPid: number | null = null,
): Promise<number[]> {
  const killed = new Set<number>();

  for (const pid of await listPidsListeningOnPort(port)) {
    if (keepPid != null && pid === keepPid) continue;
    if (forceKillPid(pid)) killed.add(pid);
  }

  for (const pid of killBundledWorkerByImageName(keepPid)) {
    killed.add(pid);
  }

  return [...killed];
}

export const workerProcessManager = new WorkerProcessManager();
