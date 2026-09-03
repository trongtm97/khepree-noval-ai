/**
 * Canonical browser account/profile pool states (Prompt 07).
 * Scheduler/UI map through these — no plan names or official API.
 */

export const BROWSER_ACCOUNT_POOL_STATES = [
  'READY',
  'BUSY',
  'COOLDOWN',
  'QUOTA_EXHAUSTED',
  'LOGIN_REQUIRED',
  'CAPTCHA_REQUIRED',
  'BLOCKED',
  'DISABLED',
  'ERROR',
] as const;

export type BrowserAccountPoolState = (typeof BROWSER_ACCOUNT_POOL_STATES)[number];

/** User-facing attention actions when automation stops for human help. */
export const BROWSER_ATTENTION_KINDS = [
  'LOGIN_REQUIRED',
  'CAPTCHA_REQUIRED',
  'BLOCKED',
  'QUOTA_EXHAUSTED',
  'ERROR',
] as const;

export type BrowserAttentionKind = (typeof BROWSER_ATTENTION_KINDS)[number];

export const BROWSER_ATTENTION_ACTIONS = [
  'open_login',
  'open_browser',
  'mark_ready',
  'disable_account',
  'dismiss',
] as const;

export type BrowserAttentionAction = (typeof BROWSER_ATTENTION_ACTIONS)[number];

/** Map legacy Google account status → pool state. */
export function googleStatusToPoolState(status: string): BrowserAccountPoolState {
  switch (status) {
    case 'READY':
      return 'READY';
    case 'BUSY':
      return 'BUSY';
    case 'LIMITED':
      return 'QUOTA_EXHAUSTED';
    case 'LOGIN_REQUIRED':
    case 'NEW':
      return 'LOGIN_REQUIRED';
    case 'DISABLED':
      return 'DISABLED';
    case 'NEEDS_ATTENTION':
      return 'ERROR';
    default:
      return 'ERROR';
  }
}

/** Map worker_states.health → pool state. */
export function workerHealthToPoolState(health: string): BrowserAccountPoolState {
  switch (health) {
    case 'READY':
      return 'READY';
    case 'BUSY':
      return 'BUSY';
    case 'LIMITED':
      return 'QUOTA_EXHAUSTED';
    case 'OFFLINE':
      return 'COOLDOWN';
    case 'DISABLED':
      return 'DISABLED';
    case 'NEEDS_ATTENTION':
      return 'ERROR';
    default:
      return 'ERROR';
  }
}

/** Pool states that must not receive new work. */
export function isPoolStateAdmissible(state: BrowserAccountPoolState): boolean {
  return state === 'READY';
}

/** Map automation error codes → attention / pool state. */
export function automationCodeToPoolState(
  code: string,
): { pool: BrowserAccountPoolState; attention: BrowserAttentionKind | null } {
  const c = code.toUpperCase();
  if (c === 'CAPTCHA' || c.includes('CAPTCHA')) {
    return { pool: 'CAPTCHA_REQUIRED', attention: 'CAPTCHA_REQUIRED' };
  }
  if (c.includes('LOGIN') || c === 'SESSION_EXPIRED') {
    return { pool: 'LOGIN_REQUIRED', attention: 'LOGIN_REQUIRED' };
  }
  if (c.includes('QUOTA') || c.includes('RATE_LIMIT')) {
    return { pool: 'QUOTA_EXHAUSTED', attention: 'QUOTA_EXHAUSTED' };
  }
  if (c.includes('BLOCK') || c.includes('SECURITY')) {
    return { pool: 'BLOCKED', attention: 'BLOCKED' };
  }
  return { pool: 'ERROR', attention: 'ERROR' };
}
