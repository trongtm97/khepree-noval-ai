import { t } from './index';

export type FriendlyErrorCode =
  | 'SELECTOR_NOT_FOUND'
  | 'LOGIN_REQUIRED'
  | 'CAPTCHA'
  | 'QUOTA_LIMIT'
  | 'NETWORK_ERROR'
  | 'RESPONSE_TIMEOUT'
  | 'MALFORMED_OUTPUT'
  | 'PROVIDER_ERROR'
  | 'MAX_REPAIR'
  | 'UNKNOWN';

const CODE_ALIASES: { match: RegExp; code: FriendlyErrorCode }[] = [
  { match: /SELECTOR_NOT_FOUND|locator\(/i, code: 'SELECTOR_NOT_FOUND' },
  { match: /LOGIN_REQUIRED|sign.?in|login/i, code: 'LOGIN_REQUIRED' },
  { match: /CAPTCHA|verification|challenge/i, code: 'CAPTCHA' },
  { match: /QUOTA_LIMIT|quota|rate.?limit/i, code: 'QUOTA_LIMIT' },
  { match: /NETWORK|ENOTFOUND|ECONNRESET|fetch failed/i, code: 'NETWORK_ERROR' },
  { match: /TIMEOUT|timed?\s*out|RESPONSE_TIMEOUT/i, code: 'RESPONSE_TIMEOUT' },
  { match: /PROVIDER_ERROR|GEMINI_SOFT_ERROR|soft.?error/i, code: 'PROVIDER_ERROR' },
  { match: /MALFORMED_OUTPUT/i, code: 'MALFORMED_OUTPUT' },
  { match: /Max repair attempts/i, code: 'MAX_REPAIR' },
];

export function detectErrorCode(raw: string | null | undefined): FriendlyErrorCode {
  if (!raw) return 'UNKNOWN';
  for (const { match, code } of CODE_ALIASES) {
    if (match.test(raw)) return code;
  }
  return 'UNKNOWN';
}

export function friendlyError(raw: string | null | undefined): {
  code: FriendlyErrorCode;
  title: string;
  description: string;
  technical: string | null;
} {
  const code = detectErrorCode(raw);
  return {
    code,
    title: t(`errors.${code}.title`),
    description: t(`errors.${code}.description`),
    technical: raw ?? null,
  };
}
