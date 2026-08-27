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
  /** Prompt accepted by composer but truncated vs intended payload. */
  'PROMPT_TOO_LARGE',
  /** Send clicked/attempted but no reliable evidence the message left the composer. */
  'SEND_NOT_CONFIRMED',
  /** No assistant response provably tied to the current correlation/request. */
  'RESPONSE_NOT_FOUND',
  /** Multiple assistant candidates; cannot prove which belongs to this request. */
  'RESPONSE_AMBIGUOUS',
  /** Target response looks truncated / protocol incomplete — not COMPLETED. */
  'OUTPUT_INCOMPLETE',
  /** Model/UI reported an in-bubble generation failure. */
  'GENERATION_ERROR',
  /** Composer visible but rejected / did not accept prompt payload. */
  'COMPOSER_FILL_FAILED',
  /** Send control stayed disabled after a verified fill. */
  'SEND_DISABLED',
  /** Expected notebook URL / context did not match the open page. */
  'NOTEBOOK_MISMATCH',
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
  'PROMPT_TOO_LARGE',
  'SEND_NOT_CONFIRMED',
  'RESPONSE_NOT_FOUND',
  'RESPONSE_AMBIGUOUS',
  'OUTPUT_INCOMPLETE',
  'GENERATION_ERROR',
  'COMPOSER_FILL_FAILED',
  'SEND_DISABLED',
  'NOTEBOOK_MISMATCH',
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
