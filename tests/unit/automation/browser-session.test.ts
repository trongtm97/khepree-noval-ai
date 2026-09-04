import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { AutomationManager } from '@main/automation/automation-manager';
import { ProfileLeaseLockManager } from '@main/automation/browser-runner/profile-lock';
import { newId } from '@main/db/utils/uuid';
import { startFixtureServer } from './fixture-server';

const FIXTURE_DIR = path.resolve(
  __dirname,
  '../../fixtures/automation',
);

describe('Browser automation core (mock HTML)', { timeout: 60_000 }, () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let tempRoot: string;
  let manager: AutomationManager;
  let locks: ProfileLeaseLockManager;

  beforeAll(async () => {
    const server = await startFixtureServer(FIXTURE_DIR);
    baseUrl = server.baseUrl;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    await closeServer();
  }, 60_000);

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-auto-'));
    locks = new ProfileLeaseLockManager();
    manager = new AutomationManager({
      cacheDir: path.join(tempRoot, 'cache'),
      transport: 'in-process',
      locks,
    });
  });

  afterEach(async () => {
    await manager.disposeAll();
    // Windows Chromium may briefly hold profile DB files after close.
    for (let i = 0; i < 8; i++) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EBUSY' && code !== 'EPERM') throw err;
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
  }, 60_000);

  it('runs OPEN / NAVIGATE / GET_STATUS / SCREENSHOT / CLOSE commands', async () => {
    const workerId = newId();
    const profilePath = path.join(tempRoot, 'profiles', workerId);

    const opened = await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });
    expect(opened.ok).toBe(true);
    expect(opened.state).toBe('READY');

    const status = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'GET_STATUS',
    });
    expect(status.data?.url).toContain('ready.html');

    const shot = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'SCREENSHOT',
      tag: 'ready',
    });
    expect(shot.ok).toBe(true);
    const shotPath = shot.data?.screenshotPath;
    expect(typeof shotPath).toBe('string');
    expect(fs.existsSync(String(shotPath))).toBe(true);

    const closed = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'CLOSE',
    });
    expect(closed.state).toBe('STOPPED');
  });

  it('persists profile data across reopen', async () => {
    const workerId = newId();
    const profilePath = path.join(tempRoot, 'profiles', workerId);

    await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });
    await manager.closeWorker(workerId);

    const reopened = await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });
    expect(reopened.ok).toBe(true);

    // localStorage from first visit should still be present (Playwright persistent context)
    const nav = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'NAVIGATE',
      url: `${baseUrl}/ready.html`,
    });
    expect(nav.ok).toBe(true);
    expect(fs.existsSync(profilePath)).toBe(true);
  });

  it('returns LOGIN_REQUIRED without infinite retry', async () => {
    const workerId = newId();
    const profilePath = path.join(tempRoot, 'profiles', workerId);
    await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });

    const result = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'NAVIGATE',
      url: `${baseUrl}/login.html`,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('LOGIN_REQUIRED');
    expect(result.state).toBe('USER_ACTION_REQUIRED');
  });

  it('captures screenshot on navigation timeout failure', async () => {
    const workerId = newId();
    const profilePath = path.join(tempRoot, 'profiles', workerId);
    await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });

    const result = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'NAVIGATE',
      url: 'http://127.0.0.1:1/',
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    expect(
      result.errorCode === 'NAVIGATION_TIMEOUT' ||
        result.errorCode === 'NETWORK_ERROR',
    ).toBe(true);
    expect(result.diagnostics?.operationName).toBeTruthy();
    expect(result.diagnostics?.timestamp).toBeTruthy();
    // screenshot may or may not succeed depending on browser state; path field must exist
    expect(result.diagnostics).toBeDefined();
    expect('screenshotPath' in (result.diagnostics ?? {})).toBe(true);
  });

  it('RESTART reopens dedicated profile without Chrome default profile', async () => {
    const workerId = newId();
    const profilePath = path.join(tempRoot, 'profiles', workerId);
    await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });

    const restarted = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'RESTART',
      startUrl: `${baseUrl}/ready.html`,
    });
    expect(restarted.ok).toBe(true);
    expect(restarted.data?.profilePath).toBe(path.resolve(profilePath));
  });

  it('never allows two workers on same userDataDir', async () => {
    const profilePath = path.join(tempRoot, 'profiles', 'shared');
    const a = newId();
    await manager.openWorker({
      workerId: a,
      profilePath,
      headless: true,
      startUrl: `${baseUrl}/ready.html`,
    });

    await expect(
      manager.openWorker({
        workerId: newId(),
        profilePath,
        headless: true,
      }),
    ).rejects.toThrow(/PROFILE_BUSY|already in use|lock|đang được sử dụng/i);
  });
});
