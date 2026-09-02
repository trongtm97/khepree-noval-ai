import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveBrowserEngine,
  resolveLoginBrowserPreference,
  LOGIN_SYSTEM_BROWSER_REQUIRED_MESSAGE,
  windowsChromeCandidates,
  windowsEdgeCandidates,
} from '@main/automation/browser-runner/browser-engine-resolver';
import {
  getBrowserEngineConfig,
  resetBrowserEngineConfigOverride,
  setBrowserEngineConfigOverride,
} from '@main/automation/browser-runner/browser-engine-config';
import {
  launchKhepreeNovelAIPersistentContext,
  writeBrowserEngineDiagnostics,
  toBrowserEngineDiagnosticsSnapshot,
  playwrightLaunchAutomationOptions,
} from '@main/automation/browser-runner/launch-persistent-context';
import {
  looksLikeInsecureBrowserInterstitial,
} from '@main/automation/browser-runner/browser-session-controller';
import { ProfileLeaseLockManager } from '@main/automation/browser-runner/profile-lock';

describe('BrowserEngineResolver', () => {
  afterEach(() => {
    resetBrowserEngineConfigOverride();
    delete process.env.NTS_BROWSER_ENGINE;
    delete process.env.NTS_DISABLE_AUTOMATION_CONTROLLED;
  });

  it('AUTO prefers Edge then Chrome then Playwright Chromium on Windows', () => {
    const chromiumPath = 'C:\\pw\\chromium.exe';
    const onlyChromium = resolveBrowserEngine('AUTO', {
      platform: 'win32',
      existsSync: (p) => p === chromiumPath,
      chromiumExecutablePath: chromiumPath,
      chromiumAvailable: true,
      playwrightVersion: '1.62.1',
    });
    expect(onlyChromium).toMatchObject({
      preference: 'AUTO',
      engine: 'PLAYWRIGHT_CHROMIUM',
      playwrightVersion: '1.62.1',
      executablePath: chromiumPath,
    });
    expect(onlyChromium.channel).toBeUndefined();
  });

  it('AUTO throws when no Edge/Chrome/Chromium executable', () => {
    expect(() =>
      resolveBrowserEngine('AUTO', {
        platform: 'win32',
        existsSync: () => false,
        chromiumAvailable: false,
        playwrightVersion: '1.62.1',
      }),
    ).toThrow(/Edge|Chrome/i);
  });

  it('AUTO picks Edge when Edge Stable path exists', () => {
    const env = {
      ProgramFiles: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PF86',
    };
    const edgePath = windowsEdgeCandidates(env)[0];
    const resolved = resolveBrowserEngine('AUTO', {
      platform: 'win32',
      env,
      existsSync: (p) => p === edgePath,
      playwrightVersion: '1.62.1',
    });
    expect(resolved.engine).toBe('EDGE');
    expect(resolved.channel).toBe('msedge');
    expect(resolved.executablePath).toBe(edgePath);
  });

  it('AUTO picks Chrome when Edge missing but Chrome present', () => {
    const env = {
      ProgramFiles: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PF86',
      LOCALAPPDATA: 'C:\\Local',
    };
    const chromePath = windowsChromeCandidates(env)[0];
    const resolved = resolveBrowserEngine('AUTO', {
      platform: 'win32',
      env,
      existsSync: (p) => p === chromePath,
      playwrightVersion: '1.62.1',
    });
    expect(resolved.engine).toBe('CHROME');
    expect(resolved.channel).toBe('chrome');
  });

  it('EDGE / CHROME throw when binary missing', () => {
    expect(() =>
      resolveBrowserEngine('EDGE', {
        platform: 'win32',
        existsSync: () => false,
        playwrightVersion: '1.62.1',
      }),
    ).toThrow(/Edge/i);
    expect(() =>
      resolveBrowserEngine('CHROME', {
        platform: 'win32',
        existsSync: () => false,
        playwrightVersion: '1.62.1',
      }),
    ).toThrow(/Chrome/i);
  });

  it('PLAYWRIGHT_CHROMIUM ignores installed browsers when Chromium exists', () => {
    const edgePath = windowsEdgeCandidates({
      ProgramFiles: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PF86',
    })[0];
    const chromiumPath = 'C:\\pw\\chromium.exe';
    const resolved = resolveBrowserEngine('PLAYWRIGHT_CHROMIUM', {
      platform: 'win32',
      existsSync: (p) => p === edgePath || p === chromiumPath,
      chromiumExecutablePath: chromiumPath,
      chromiumAvailable: true,
      playwrightVersion: '1.62.1',
    });
    expect(resolved.engine).toBe('PLAYWRIGHT_CHROMIUM');
    expect(resolved.channel).toBeUndefined();
  });

  it('advanced anti-detect flag defaults OFF', () => {
    expect(getBrowserEngineConfig().disableAutomationControlled).toBe(false);
    process.env.NTS_DISABLE_AUTOMATION_CONTROLLED = '1';
    expect(getBrowserEngineConfig().disableAutomationControlled).toBe(true);
    setBrowserEngineConfigOverride({ disableAutomationControlled: false });
    expect(getBrowserEngineConfig().disableAutomationControlled).toBe(false);
  });

  it('resolveLoginBrowserPreference prefers Chrome then Edge; refuses Chromium-only', () => {
    const env = {
      ProgramFiles: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PF86',
      LOCALAPPDATA: 'C:\\Local',
    };
    const chromePath = windowsChromeCandidates(env)[0];
    const edgePath = windowsEdgeCandidates(env)[0];

    expect(
      resolveLoginBrowserPreference({
        platform: 'win32',
        env,
        existsSync: (p) => p === chromePath || p === edgePath,
      }),
    ).toBe('CHROME');

    expect(
      resolveLoginBrowserPreference({
        platform: 'win32',
        env,
        existsSync: (p) => p === edgePath,
      }),
    ).toBe('EDGE');

    expect(() =>
      resolveLoginBrowserPreference({
        platform: 'win32',
        env,
        existsSync: () => false,
        chromiumAvailable: true,
        chromiumExecutablePath: 'C:\\pw\\chromium.exe',
      }),
    ).toThrow(LOGIN_SYSTEM_BROWSER_REQUIRED_MESSAGE);
  });

  it('loginCompat launch options ignore --enable-automation and disable AutomationControlled', () => {
    expect(
      playwrightLaunchAutomationOptions({
        loginCompat: true,
        disableAutomationControlled: true,
      }),
    ).toEqual({
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    expect(
      playwrightLaunchAutomationOptions({
        loginCompat: false,
        disableAutomationControlled: false,
      }),
    ).toEqual({});
  });

  it('detects Google insecure-browser interstitial text', () => {
    expect(
      looksLikeInsecureBrowserInterstitial(
        'https://accounts.google.com/v3/signin/rejected',
        'This browser or app may not be secure. Try using a different browser.',
      ),
    ).toBe(true);
    expect(
      looksLikeInsecureBrowserInterstitial(
        'https://gemini.google.com/app',
        'Welcome to Gemini',
      ),
    ).toBe(false);
  });
});

describe('launchKhepreeNovelAIPersistentContext + profile lock', () => {
  afterEach(() => {
    resetBrowserEngineConfigOverride();
  });

  it('writes engine-info diagnostics and rejects second lock on same profile', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-engine-'));
    const profilePath = path.join(root, 'profiles', 'acct-1');
    const diagnosticsDir = path.join(root, 'diag');
    fs.mkdirSync(profilePath, { recursive: true });

    setBrowserEngineConfigOverride({ enginePreference: 'AUTO' });

    const locks = new ProfileLeaseLockManager();
    locks.acquireLease({ profilePath: profilePath, ownerId: 'owner-a', accountId: 'owner-a', operation: 'manual_browser' });

    expect(() => {
      locks.acquireLease({ profilePath: profilePath, ownerId: 'owner-b', accountId: 'owner-b', operation: 'manual_browser' });
    }).toThrow(/already in use|PROFILE_BUSY|đang được sử dụng/i);

    // Prefer installed Edge/Chrome; Chromium only if actually on disk.
    setBrowserEngineConfigOverride({ enginePreference: 'AUTO' });

    const launched = await launchKhepreeNovelAIPersistentContext({
      profilePath,
      headless: true,
      diagnosticsDir,
    });

    expect(['EDGE', 'CHROME', 'PLAYWRIGHT_CHROMIUM']).toContain(launched.resolved.engine);
    expect(launched.disableAutomationControlled).toBe(false);
    const engineFile = path.join(diagnosticsDir, 'engine-info.json');
    expect(fs.existsSync(engineFile)).toBe(true);
    const snap = JSON.parse(fs.readFileSync(engineFile, 'utf8')) as {
      playwrightVersion: string;
      engine: string;
      disableAutomationControlled: boolean;
      profilePath: string;
    };
    expect(['EDGE', 'CHROME', 'PLAYWRIGHT_CHROMIUM']).toContain(snap.engine);
    expect(snap.disableAutomationControlled).toBe(false);
    expect(snap.profilePath).toBe(profilePath);
    expect(snap.playwrightVersion).toMatch(/^\d+\.\d+\.\d+/);

    // Profile marker persists across close/reopen of context.
    const marker = path.join(profilePath, 'nts-persist-marker.txt');
    fs.writeFileSync(marker, 'ok', 'utf8');
    await launched.context.close();

    const relaunched = await launchKhepreeNovelAIPersistentContext({
      profilePath,
      headless: true,
      diagnosticsDir,
    });
    expect(fs.existsSync(marker)).toBe(true);
    await relaunched.context.close();

    locks.releaseLease(profilePath, 'owner-a');
    fs.rmSync(root, { recursive: true, force: true });
  }, 60_000);

  it('can resolve live Edge / Chrome when installed (skip if absent)', async () => {
    const edge = resolveBrowserEngine('AUTO', { platform: 'win32' });
    if (edge.engine !== 'EDGE' && edge.engine !== 'CHROME') {
      return;
    }

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-channel-'));
    const profilePath = path.join(root, 'profile');
    fs.mkdirSync(profilePath, { recursive: true });
    setBrowserEngineConfigOverride({
      enginePreference: edge.engine === 'EDGE' ? 'EDGE' : 'CHROME',
    });

    const launched = await launchKhepreeNovelAIPersistentContext({
      profilePath,
      headless: true,
      diagnosticsDir: path.join(root, 'diag'),
    });
    expect(launched.resolved.engine).toBe(edge.engine);
    expect(launched.resolved.channel).toBeTruthy();
    await launched.context.close();
    fs.rmSync(root, { recursive: true, force: true });
  }, 90_000);

  it('toBrowserEngineDiagnosticsSnapshot includes version + engine', () => {
    const resolved = resolveBrowserEngine('PLAYWRIGHT_CHROMIUM', {
      playwrightVersion: '1.62.1',
      chromiumAvailable: true,
      chromiumExecutablePath: 'C:\\pw\\chromium.exe',
      existsSync: () => true,
    });
    const snap = toBrowserEngineDiagnosticsSnapshot(resolved, {
      headless: false,
      disableAutomationControlled: false,
      loginCompat: true,
      profilePath: 'D:\\profiles\\x',
    });
    expect(snap.loginCompat).toBe(true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-snap-'));
    writeBrowserEngineDiagnostics(dir, snap);
    expect(fs.existsSync(path.join(dir, 'engine-info.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
