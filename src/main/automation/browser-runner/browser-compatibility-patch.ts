/**
 * Named Playwright launch compatibility patches.
 *
 * NovelTrans default: standard Playwright persistent context — no init-script stealth.
 * Patches here are explicit, documented, and opt-in only.
 */

export const BrowserCompatibilityPatch = {
  /**
   * Google account sign-in: ignore Playwright `--enable-automation` and add
   * `--disable-blink-features=AutomationControlled`.
   * Reason: Google may show "This browser or app may not be secure" without it.
   * Scope: Gemini / Google account login opens only (`browser-session-controller`).
   */
  GOOGLE_LOGIN_LAUNCH: 'google-login-launch',
  /**
   * Advanced operator opt-in via `NTS_DISABLE_AUTOMATION_CONTROLLED=1`.
   * Not applied by default.
   */
  DISABLE_AUTOMATION_CONTROLLED: 'disable-automation-controlled',
} as const;

export type BrowserCompatibilityPatchId =
  (typeof BrowserCompatibilityPatch)[keyof typeof BrowserCompatibilityPatch];

export interface PlaywrightLaunchPatchInput {
  /** When true, applies {@link BrowserCompatibilityPatch.GOOGLE_LOGIN_LAUNCH}. */
  loginCompat?: boolean;
  /** When true, applies {@link BrowserCompatibilityPatch.DISABLE_AUTOMATION_CONTROLLED}. */
  disableAutomationControlled?: boolean;
}

/** Resolve active patch ids for diagnostics. */
export function activeBrowserCompatibilityPatches(
  input: PlaywrightLaunchPatchInput,
): BrowserCompatibilityPatchId[] {
  const patches: BrowserCompatibilityPatchId[] = [];
  if (input.loginCompat) {
    patches.push(BrowserCompatibilityPatch.GOOGLE_LOGIN_LAUNCH);
  }
  if (input.disableAutomationControlled) {
    patches.push(BrowserCompatibilityPatch.DISABLE_AUTOMATION_CONTROLLED);
  }
  return patches;
}

/** Playwright `launchPersistentContext` extras for named compatibility patches. */
export function buildPlaywrightLaunchPatchOptions(
  options: PlaywrightLaunchPatchInput,
): { args?: string[]; ignoreDefaultArgs?: string[] } {
  const args = options.disableAutomationControlled
    ? ['--disable-blink-features=AutomationControlled']
    : [];
  return {
    ...(args.length > 0 ? { args } : {}),
    ...(options.loginCompat ? { ignoreDefaultArgs: ['--enable-automation'] } : {}),
  };
}

/** @deprecated Prefer {@link buildPlaywrightLaunchPatchOptions}. */
export const playwrightLaunchAutomationOptions = buildPlaywrightLaunchPatchOptions;
