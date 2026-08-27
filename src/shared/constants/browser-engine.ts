/** Preferred browser engine for Playwright persistent contexts. */
export const BROWSER_ENGINE_PREFERENCES = [
  'AUTO',
  'EDGE',
  'CHROME',
  'PLAYWRIGHT_CHROMIUM',
] as const;

export type BrowserEnginePreference = (typeof BROWSER_ENGINE_PREFERENCES)[number];

/** Concrete engine after resolution (never AUTO). */
export const RESOLVED_BROWSER_ENGINES = [
  'EDGE',
  'CHROME',
  'PLAYWRIGHT_CHROMIUM',
] as const;

export type ResolvedBrowserEngineId = (typeof RESOLVED_BROWSER_ENGINES)[number];

/** Env: NTS_BROWSER_ENGINE=AUTO|EDGE|CHROME|PLAYWRIGHT_CHROMIUM */
export const BROWSER_ENGINE_ENV = 'NTS_BROWSER_ENGINE';

/**
 * Advanced / opt-in only. Default OFF.
 * Env: NTS_DISABLE_AUTOMATION_CONTROLLED=1|true
 */
export const DISABLE_AUTOMATION_CONTROLLED_ENV = 'NTS_DISABLE_AUTOMATION_CONTROLLED';
