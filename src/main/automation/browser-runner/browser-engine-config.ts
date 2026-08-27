import {
  BROWSER_ENGINE_ENV,
  BROWSER_ENGINE_PREFERENCES,
  DISABLE_AUTOMATION_CONTROLLED_ENV,
  type BrowserEnginePreference,
} from '@shared/constants/browser-engine';

export interface BrowserEngineAdvancedConfig {
  /** Default AUTO — Windows picks Edge → Chrome → Playwright Chromium. */
  enginePreference: BrowserEnginePreference;
  /**
   * Inject `--disable-blink-features=AutomationControlled`.
   * Advanced compatibility only — OFF by default.
   */
  disableAutomationControlled: boolean;
}

const DEFAULT_CONFIG: BrowserEngineAdvancedConfig = {
  enginePreference: 'AUTO',
  disableAutomationControlled: false,
};

/** Test / runtime override (null = read env). */
let runtimeOverride: Partial<BrowserEngineAdvancedConfig> | null = null;

export function setBrowserEngineConfigOverride(
  override: Partial<BrowserEngineAdvancedConfig> | null,
): void {
  runtimeOverride = override;
}

export function resetBrowserEngineConfigOverride(): void {
  runtimeOverride = null;
}

function parsePreference(raw: string | undefined): BrowserEnginePreference | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase().replace(/-/g, '_');
  if ((BROWSER_ENGINE_PREFERENCES as readonly string[]).includes(normalized)) {
    return normalized as BrowserEnginePreference;
  }
  return null;
}

function parseBoolEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Advanced browser engine config.
 * Defaults: AUTO engine, anti-detection flag OFF.
 */
export function getBrowserEngineConfig(): BrowserEngineAdvancedConfig {
  const fromEnvPreference = parsePreference(process.env[BROWSER_ENGINE_ENV]);
  const fromEnvAntiDetect = parseBoolEnv(process.env[DISABLE_AUTOMATION_CONTROLLED_ENV]);

  return {
    enginePreference:
      runtimeOverride?.enginePreference ??
      fromEnvPreference ??
      DEFAULT_CONFIG.enginePreference,
    disableAutomationControlled:
      runtimeOverride?.disableAutomationControlled ??
      (fromEnvAntiDetect || DEFAULT_CONFIG.disableAutomationControlled),
  };
}
