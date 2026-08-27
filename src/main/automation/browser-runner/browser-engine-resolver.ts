import fs from 'node:fs';
import path from 'node:path';
import playwrightPackage from 'playwright/package.json';
import type {
  BrowserEnginePreference,
  ResolvedBrowserEngineId,
} from '@shared/constants/browser-engine';

export type PlaywrightBrowserChannel = 'msedge' | 'chrome';

export interface ResolvedBrowserEngine {
  preference: BrowserEnginePreference;
  engine: ResolvedBrowserEngineId;
  /** Playwright channel when using installed Edge/Chrome. Absent for bundled Chromium. */
  channel?: PlaywrightBrowserChannel;
  /** Absolute path used for existence probe / launch executablePath when no channel. */
  executablePath: string | null;
  playwrightVersion: string;
  displayName: string;
}

export interface BrowserEngineResolverDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  playwrightVersion?: string;
  /**
   * Playwright Chromium executable path (from chromium.executablePath()).
   * When set, AUTO / PLAYWRIGHT_CHROMIUM verify this file exists.
   */
  chromiumExecutablePath?: string | null;
  /**
   * Explicit Chromium availability. When false, Chromium fallback is refused.
   * When undefined, inferred from chromiumExecutablePath + existsSync.
   */
  chromiumAvailable?: boolean;
}

function readPlaywrightVersion(fallback: string): string {
  return typeof playwrightPackage.version === 'string'
    ? playwrightPackage.version
    : fallback;
}

/** Stable Edge / Chrome install paths on Windows (dedicated NovelTrans profile still used). */
export function windowsEdgeCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const pf = env.ProgramFiles ?? 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  return [
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
}

export function windowsChromeCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const pf = env.ProgramFiles ?? 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA ?? '';
  const paths = [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  if (local) {
    paths.push(path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  return paths;
}

function firstExisting(
  candidates: string[],
  existsSync: (p: string) => boolean,
): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export const CHROMIUM_MISSING_MESSAGE =
  'Chromium Playwright chưa có trên máy này. Cài Microsoft Edge hoặc Google Chrome (khuyến nghị) để dùng Browser provider.';

export const NO_SYSTEM_BROWSER_MESSAGE =
  'Không tìm thấy Microsoft Edge hoặc Google Chrome. Cài Edge hoặc Chrome để dùng Gemini Browser. Không cần Node.js hay lệnh cài thêm.';

/** Google account login requires a real system browser — bundled Chromium is refused. */
export const LOGIN_SYSTEM_BROWSER_REQUIRED_MESSAGE =
  'Đăng nhập Google cần Microsoft Edge hoặc Google Chrome (không dùng Chromium Playwright). Cài Edge hoặc Chrome rồi mở lại trình duyệt đăng nhập.';

/**
 * Preference for interactive Google login: Chrome → Edge.
 * Never returns PLAYWRIGHT_CHROMIUM (Google blocks it with "browser may not be secure").
 */
export function resolveLoginBrowserPreference(
  deps: BrowserEngineResolverDeps = {},
): Extract<BrowserEnginePreference, 'CHROME' | 'EDGE'> {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const existsSync = deps.existsSync ?? fs.existsSync;

  if (platform === 'win32') {
    const chromePath = firstExisting(windowsChromeCandidates(env), existsSync);
    if (chromePath) return 'CHROME';
    const edgePath = firstExisting(windowsEdgeCandidates(env), existsSync);
    if (edgePath) return 'EDGE';
  }

  throw new Error(LOGIN_SYSTEM_BROWSER_REQUIRED_MESSAGE);
}

function chromiumResolved(
  preference: BrowserEnginePreference,
  playwrightVersion: string,
  executablePath: string | null,
): ResolvedBrowserEngine {
  return {
    preference,
    engine: 'PLAYWRIGHT_CHROMIUM',
    channel: undefined,
    executablePath,
    playwrightVersion,
    displayName: 'Playwright Chromium',
  };
}

function resolveChromiumAvailability(
  deps: BrowserEngineResolverDeps,
  existsSync: (p: string) => boolean,
): { available: boolean; executablePath: string | null } {
  const executablePath =
    deps.chromiumExecutablePath === undefined
      ? null
      : deps.chromiumExecutablePath;

  if (deps.chromiumAvailable === false) {
    return { available: false, executablePath };
  }
  if (deps.chromiumAvailable === true) {
    return {
      available: true,
      executablePath: executablePath && existsSync(executablePath) ? executablePath : executablePath,
    };
  }
  if (executablePath) {
    return { available: existsSync(executablePath), executablePath };
  }
  // No probe supplied — treat as unavailable so packaged apps do not assume Chromium.
  return { available: false, executablePath: null };
}

/**
 * Resolve which Chromium-family binary Playwright should drive.
 *
 * Windows AUTO order: Microsoft Edge Stable → Google Chrome Stable → Playwright Chromium
 * (only when Chromium executable exists on disk).
 * Always pair with NovelTrans dedicated userDataDir — never the OS default profile.
 */
export function resolveBrowserEngine(
  preference: BrowserEnginePreference = 'AUTO',
  deps: BrowserEngineResolverDeps = {},
): ResolvedBrowserEngine {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const playwrightVersion =
    deps.playwrightVersion ?? readPlaywrightVersion('unknown');
  const chromium = resolveChromiumAvailability(deps, existsSync);

  if (preference === 'PLAYWRIGHT_CHROMIUM') {
    if (!chromium.available) {
      throw new Error(CHROMIUM_MISSING_MESSAGE);
    }
    return chromiumResolved(preference, playwrightVersion, chromium.executablePath);
  }

  const edgePath =
    platform === 'win32' ? firstExisting(windowsEdgeCandidates(env), existsSync) : null;
  const chromePath =
    platform === 'win32' ? firstExisting(windowsChromeCandidates(env), existsSync) : null;

  if (preference === 'EDGE') {
    if (!edgePath) {
      throw new Error(
        'Không tìm thấy Microsoft Edge. Cài Edge hoặc chọn Chrome / AUTO trong cài đặt Browser.',
      );
    }
    return {
      preference,
      engine: 'EDGE',
      channel: 'msedge',
      executablePath: edgePath,
      playwrightVersion,
      displayName: 'Microsoft Edge',
    };
  }

  if (preference === 'CHROME') {
    if (!chromePath) {
      throw new Error(
        'Không tìm thấy Google Chrome. Cài Chrome hoặc chọn Edge / AUTO trong cài đặt Browser.',
      );
    }
    return {
      preference,
      engine: 'CHROME',
      channel: 'chrome',
      executablePath: chromePath,
      playwrightVersion,
      displayName: 'Google Chrome',
    };
  }

  // AUTO
  if (platform === 'win32') {
    if (edgePath) {
      return {
        preference: 'AUTO',
        engine: 'EDGE',
        channel: 'msedge',
        executablePath: edgePath,
        playwrightVersion,
        displayName: 'Microsoft Edge',
      };
    }
    if (chromePath) {
      return {
        preference: 'AUTO',
        engine: 'CHROME',
        channel: 'chrome',
        executablePath: chromePath,
        playwrightVersion,
        displayName: 'Google Chrome',
      };
    }
  }

  if (chromium.available) {
    return chromiumResolved('AUTO', playwrightVersion, chromium.executablePath);
  }

  throw new Error(NO_SYSTEM_BROWSER_MESSAGE);
}
