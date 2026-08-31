/** Strip query strings and sensitive params before logging URLs. */
export function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    const sensitiveParams = [
      'code',
      'state',
      'token',
      'access_token',
      'refresh_token',
      'session',
      'checkout',
      'code_verifier',
    ];
    for (const key of [...parsed.searchParams.keys()]) {
      if (sensitiveParams.some((s) => key.toLowerCase().includes(s))) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

const REDACT_KEY_FRAGMENTS = [
  'token',
  'cookie',
  'password',
  'secret',
  'credential',
  'authorization',
  'oauth',
  'verifier',
  'privatekey',
  'private_key',
  'refresh',
  'sessionid',
  'session_id',
  'checkouturl',
  'checkout_url',
  'authcode',
  'auth_code',
  'apikey',
  'api_key',
  'bearer',
  'card',
  'cvv',
];

export function shouldRedactLogKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

export function sanitizeLogContext(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (shouldRedactLogKey(key)) {
      out[key] = '[REDACTED]';
    } else if (key.toLowerCase() === 'url' && typeof value === 'string') {
      out[key] = sanitizeUrlForLog(value);
    } else if (typeof value === 'string') {
      out[key] = redactSecretsInString(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function redactSecretsInString(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/mock-access-[A-Za-z0-9-]+/g, '[REDACTED]')
    .replace(/mock-refresh-[A-Za-z0-9-]+/g, '[REDACTED]');
}

/** Safe IPC/renderer error text — no raw API bodies or tokens. */
export function sanitizeIpcErrorMessage(message: string): string {
  return redactSecretsInString(message).slice(0, 500);
}
