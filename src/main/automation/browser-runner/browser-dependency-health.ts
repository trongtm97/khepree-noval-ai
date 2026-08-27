import fs from 'node:fs';
import type {
  BrowserEnginePreference,
  ResolvedBrowserEngineId,
} from '@shared/constants/browser-engine';
import {
  CHROMIUM_MISSING_MESSAGE,
  NO_SYSTEM_BROWSER_MESSAGE,
  resolveBrowserEngine,
  windowsChromeCandidates,
  windowsEdgeCandidates,
  type BrowserEngineResolverDeps,
  type ResolvedBrowserEngine,
} from './browser-engine-resolver';

export interface BrowserDependencyHealth {
  /** Edge Stable installed on this machine. */
  edgeAvailable: boolean;
  /** Chrome Stable installed on this machine. */
  chromeAvailable: boolean;
  /**
   * Playwright bundled Chromium binary exists on disk.
   * Packaged apps usually do NOT ship Chromium — Edge/Chrome preferred.
   */
  chromiumAvailable: boolean;
  chromiumExecutablePath: string | null;
  /** At least one usable engine for Browser provider. */
  browserUsable: boolean;
  /** Engine AUTO would pick right now (null if none usable). */
  preferredEngine: ResolvedBrowserEngineId | null;
  resolved: ResolvedBrowserEngine | null;
  /** User-facing Vietnamese — never mentions npx / npm. */
  message: string;
}

export interface BrowserDependencyHealthDeps extends BrowserEngineResolverDeps {
  /** Absolute path to Playwright Chromium executable, if known. */
  chromiumExecutablePath?: string | null;
  /** When true, try to resolve Chromium via playwright package. */
  resolveChromiumPath?: () => string | null;
}

const MSG_OK_EDGE = 'Browser sẵn sàng (Microsoft Edge).';
const MSG_OK_CHROME = 'Browser sẵn sàng (Google Chrome).';
const MSG_OK_CHROMIUM = 'Browser sẵn sàng (Chromium đi kèm Playwright).';

/**
 * Probe installed browsers + optional Playwright Chromium binary.
 * Production UX: prefer Edge/Chrome; never tell users to run npx.
 */
export function assessBrowserDependencyHealth(
  preference: BrowserEnginePreference = 'AUTO',
  deps: BrowserDependencyHealthDeps = {},
): BrowserDependencyHealth {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const existsSync = deps.existsSync ?? fs.existsSync;

  const edgePath =
    platform === 'win32' ? firstExisting(windowsEdgeCandidates(env), existsSync) : null;
  const chromePath =
    platform === 'win32' ? firstExisting(windowsChromeCandidates(env), existsSync) : null;

  const chromiumExecutablePath = resolveChromiumExecutablePath(deps);
  const chromiumAvailable = Boolean(
    chromiumExecutablePath && existsSync(chromiumExecutablePath),
  );

  const edgeAvailable = Boolean(edgePath);
  const chromeAvailable = Boolean(chromePath);

  let resolved: ResolvedBrowserEngine | null = null;
  let preferredEngine: ResolvedBrowserEngineId | null = null;
  let browserUsable = false;
  let message = NO_SYSTEM_BROWSER_MESSAGE;

  try {
    resolved = resolveBrowserEngine(preference, {
      ...deps,
      chromiumExecutablePath: chromiumAvailable ? chromiumExecutablePath : null,
      chromiumAvailable,
    });
    preferredEngine = resolved.engine;
    browserUsable = true;
    if (resolved.engine === 'EDGE') message = MSG_OK_EDGE;
    else if (resolved.engine === 'CHROME') message = MSG_OK_CHROME;
    else message = MSG_OK_CHROMIUM;
  } catch (error) {
    browserUsable = false;
    preferredEngine = null;
    resolved = null;
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('Chromium')) {
      message = CHROMIUM_MISSING_MESSAGE;
    } else {
      message = edgeAvailable || chromeAvailable ? errMsg : NO_SYSTEM_BROWSER_MESSAGE;
    }
  }

  return {
    edgeAvailable,
    chromeAvailable,
    chromiumAvailable,
    chromiumExecutablePath: chromiumAvailable ? chromiumExecutablePath : null,
    browserUsable,
    preferredEngine,
    resolved,
    message,
  };
}

function resolveChromiumExecutablePath(deps: BrowserDependencyHealthDeps): string | null {
  if (deps.chromiumExecutablePath !== undefined) {
    return deps.chromiumExecutablePath;
  }
  if (deps.resolveChromiumPath) {
    try {
      return deps.resolveChromiumPath();
    } catch {
      return null;
    }
  }
  try {
    // Lazy require — avoids hard fail when playwright browsers not downloaded.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chromium } = require('playwright') as typeof import('playwright');
    const exe = chromium.executablePath();
    return typeof exe === 'string' && exe.length > 0 ? exe : null;
  } catch {
    return null;
  }
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

/** User-facing error when Browser provider cannot launch. */
export function browserUnavailableUserMessage(health?: BrowserDependencyHealth): string {
  return health?.message ?? NO_SYSTEM_BROWSER_MESSAGE;
}

export function lookLikeMissingPlaywrightBrowser(errorMessage: string): boolean {
  return /Executable doesn't exist|browserType\.launch|Failed to launch.*(chromium|chrome|msedge)|playwright.*chromium/i.test(
    errorMessage,
  );
}
