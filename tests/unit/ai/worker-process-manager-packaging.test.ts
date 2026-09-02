import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUNDLED_WORKER_EXE_NAME,
  WorkerProcessManager,
} from '@main/ai/worker-process-manager';

describe('WorkerProcessManager packaging modes', () => {
  const prevForceBundled = process.env.NTS_FORCE_BUNDLED_WORKER;
  const prevForcePython = process.env.NTS_FORCE_PYTHON_WORKER;
  let tmp: string | null = null;

  afterEach(() => {
    if (prevForceBundled === undefined) delete process.env.NTS_FORCE_BUNDLED_WORKER;
    else process.env.NTS_FORCE_BUNDLED_WORKER = prevForceBundled;
    if (prevForcePython === undefined) delete process.env.NTS_FORCE_PYTHON_WORKER;
    else process.env.NTS_FORCE_PYTHON_WORKER = prevForcePython;
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = null;
    }
  });

  it('detectInstall prefers bundled exe when present', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-worker-'));
    const workersDir = path.join(tmp, 'workers');
    fs.mkdirSync(workersDir, { recursive: true });
    const exe = path.join(workersDir, BUNDLED_WORKER_EXE_NAME);
    fs.writeFileSync(exe, 'fake');

    const mgr = new WorkerProcessManager();
    const original = mgr.bundledWorkerExePath.bind(mgr);
    mgr.bundledWorkerExePath = () => exe;

    const status = mgr.detectInstall();
    expect(status.ok).toBe(true);
    expect(status.mode).toBe('bundled_exe');
    expect(status.pythonPath).toBe(exe);
    expect(status.message).not.toMatch(/Python 3\.11/i);

    mgr.bundledWorkerExePath = original;
  });

  it('packaged without exe does not demand user Python install', () => {
    process.env.NTS_FORCE_BUNDLED_WORKER = '1';
    const mgr = new WorkerProcessManager();
    mgr.bundledWorkerExePath = () => null;

    const status = mgr.detectInstall();
    expect(status.ok).toBe(false);
    expect(status.mode).toBe('missing');
    expect(status.message).toMatch(/Browser/i);
    expect(status.message).not.toMatch(/Cần Python 3\.11\+ rồi dùng/i);
  });

  it('install in packaged mode without exe explains optional Web API', async () => {
    process.env.NTS_FORCE_BUNDLED_WORKER = '1';
    const mgr = new WorkerProcessManager();
    mgr.bundledWorkerExePath = () => null;

    const status = await mgr.install();
    expect(status.ok).toBe(false);
    expect(status.message).toMatch(/KhepreeNovelAIGeminiWorker|Browser/i);
    expect(status.message).not.toMatch(/npx/i);
  });
});
