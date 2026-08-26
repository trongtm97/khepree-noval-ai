export const BROWSER_STATES = [
  'STOPPED',
  'STARTING',
  'READY',
  'BUSY',
  'USER_ACTION_REQUIRED',
  'ERROR',
] as const;

export type BrowserState = (typeof BROWSER_STATES)[number];

export const AUTOMATION_ERROR_CODES = [
  'NAVIGATION_TIMEOUT',
  'SELECTOR_NOT_FOUND',
  'LOGIN_REQUIRED',
  'CAPTCHA',
  'QUOTA_LIMIT',
  'NETWORK_ERROR',
  'RESPONSE_TIMEOUT',
  'SESSION_EXPIRED',
  'UNKNOWN_UI',
] as const;

export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

/** Errors that may be retried with backoff. */
export const TRANSIENT_ERROR_CODES: ReadonlySet<AutomationErrorCode> = new Set([
  'NAVIGATION_TIMEOUT',
  'NETWORK_ERROR',
  'RESPONSE_TIMEOUT',
  'UNKNOWN_UI',
]);

/** Auth / user-action errors — do not retry indefinitely. */
export const NON_RETRYABLE_ERROR_CODES: ReadonlySet<AutomationErrorCode> = new Set([
  'LOGIN_REQUIRED',
  'CAPTCHA',
  'SESSION_EXPIRED',
  'QUOTA_LIMIT',
  'SELECTOR_NOT_FOUND',
]);

export const AUTOMATION_COMMANDS = [
  'OPEN',
  'NAVIGATE',
  'GET_STATUS',
  'SCREENSHOT',
  'CLOSE',
  'RESTART',
] as const;

export type AutomationCommandType = (typeof AUTOMATION_COMMANDS)[number];
