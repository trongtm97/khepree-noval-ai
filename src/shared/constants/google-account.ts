export const GOOGLE_ACCOUNT_PLANS = [
  'UNKNOWN',
  'FREE',
  'PLUS',
  'PRO',
  'ULTRA',
] as const;

export type GoogleAccountPlan = (typeof GOOGLE_ACCOUNT_PLANS)[number];

export const GOOGLE_ACCOUNT_STATUSES = [
  'NEW',
  'LOGIN_REQUIRED',
  'READY',
  'BUSY',
  'LIMITED',
  'NEEDS_ATTENTION',
  'DISABLED',
] as const;

export type GoogleAccountStatus = (typeof GOOGLE_ACCOUNT_STATUSES)[number];
