/** Canonical account availability for scheduler + all UI surfaces. */
export const ACCOUNT_AVAILABILITY = [
  'READY',
  'BUSY',
  'PAUSED',
  'LOGIN_REQUIRED',
  'LIMITED',
  'NEEDS_ATTENTION',
  'UNAVAILABLE',
] as const;

export type AccountAvailability = (typeof ACCOUNT_AVAILABILITY)[number];

/** UI lane — stable mapping for Accounts / Jobs / Dashboard. */
export const ACCOUNT_UI_LANES = [
  'ready',
  'running',
  'paused',
  'login',
  'limited',
  'attention',
] as const;

export type AccountUiLane = (typeof ACCOUNT_UI_LANES)[number];

export const ACCOUNT_AVAILABILITY_REASONS = [
  'worker_disabled',
  'login_required',
  'needs_attention',
  'active_job',
  'profile_lease',
  'account_busy',
  'worker_busy',
  'quota_limited',
  'profile_missing',
  'profile_locked',
  'runtime_blocked',
  'session_invalid',
  'disabled',
] as const;

export type AccountAvailabilityReason = (typeof ACCOUNT_AVAILABILITY_REASONS)[number];
