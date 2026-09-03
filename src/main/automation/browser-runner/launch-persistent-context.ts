import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import type { BrowserEnginePreference } from '@shared/constants/browser-engine';
import {
  assessBrowserDependencyHealth,
  browserUnavailableUserMessage,
} from './browser-dependency-health';
import { getBrowserEngineConfig } from './browser-engine-config';
import type { ResolvedBrowserEngine } from './browser-engine-resolver';
import { buildPlaywrightLaunchPatchOptions } from './browser-compatibility-patch';

export {
  BrowserCompatibilityPatch,
  activeBrowserCompatibilityPatches,
  buildPlaywrightLaunchPatchOptions,
} from './browser-compatibility-patch';

export interface LaunchPersistentContextInput {
  profilePath: string;
  /**
   * Explicit headless flag. When omitted, uses `headlessDefault`
   * (false for Gemini/Notebook/account workflows).
   */
  headless?: boolean;
  /** Applied when `headless` is omitted. Default false (headed). */
  headlessDefault?: boolean;
  enginePreference?: BrowserEnginePreference;
  /** Override advanced anti-detect flag. Default from config (OFF). */
  disableAutomationControlled?: boolean;
  /**
   * {@link BrowserCompatibilityPatch.GOOGLE_LOGIN_LAUNCH} — Google account login only.
   * ChatGPT / Meta AI must not set this.
   */
  loginCompat?: boolean;
  /** When set, writes engine-info.json for diagnostics. */
  diagnosticsDir?: string;
}

export interface LaunchPersistentContextResult {
  context: BrowserContext;
  resolved: ResolvedBrowserEngine;
  headless: boolean;
  disableAutomationControlled: boolean;
  loginCompat: boolean;
}

export interface BrowserEngineDiagnosticsSnapshot {
  preference: BrowserEnginePreference;
  engine: ResolvedBrowserEngine['engine'];
  channel: string | null;
  executablePath: string | null;
  playwrightVersion: string;
  displayName: string;
  headless: boolean;
  disableAutomationControlled: boolean;
  loginCompat: boolean;
  profilePath: string;
  capturedAt: string;
}

export function toBrowserEngineDiagnosticsSnapshot(
  resolved: ResolvedBrowserEngine,
  options: {
    headless: boolean;
    disableAutomationControlled: boolean;
    profilePath: string;
    loginCompat?: boolean;
  },
): BrowserEngineDiagnosticsSnapshot {
  return {
    preference: resolved.preference,
    engine: resolved.engine,
    channel: resolved.channel ?? null,
    executablePath: resolved.executablePath,
    playwrightVersion: resolved.playwrightVersion,
    displayName: resolved.displayName,
    headless: options.headless,
    disableAutomationControlled: options.disableAutomationControlled,
    loginCompat: options.loginCompat ?? false,
    profilePath: options.profilePath,
    capturedAt: new Date().toISOString(),
  };
}

export function writeBrowserEngineDiagnostics(
  diagnosticsDir: string,
  snapshot: BrowserEngineDiagnosticsSnapshot,
): string {
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const filePath = path.join(diagnosticsDir, 'engine-info.json');
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * Single entry for Khepree Novel AI Playwright persistent contexts.
 * Dedicated userDataDir only — never OS Edge/Chrome default profile.
 */
export async function launchKhepreeNovelAIPersistentContext(
  input: LaunchPersistentContextInput,
): Promise<LaunchPersistentContextResult> {
  const config = getBrowserEngineConfig();
  const preference = input.enginePreference ?? config.enginePreference;
  const health = assessBrowserDependencyHealth(preference);
  if (!health.browserUsable || !health.resolved) {
    throw new Error(browserUnavailableUserMessage(health));
  }
  const resolved = health.resolved;
  const headless = input.headless ?? input.headlessDefault ?? false;
  const loginCompat = input.loginCompat === true;
  const disableAutomationControlled =
    input.disableAutomationControlled ??
    (loginCompat || config.disableAutomationControlled);

  const automation = buildPlaywrightLaunchPatchOptions({
    loginCompat,
    disableAutomationControlled,
  });

  if (input.diagnosticsDir) {
    writeBrowserEngineDiagnostics(
      input.diagnosticsDir,
      toBrowserEngineDiagnosticsSnapshot(resolved, {
        headless,
        disableAutomationControlled,
        loginCompat,
        profilePath: input.profilePath,
      }),
    );
  }

  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(input.profilePath, {
    headless,
    ...(resolved.channel ? { channel: resolved.channel } : {}),
    ...(!resolved.channel && resolved.executablePath
      ? { executablePath: resolved.executablePath }
      : {}),
    ...automation,
  });

  return { context, resolved, headless, disableAutomationControlled, loginCompat };
}
