const FORBIDDEN_KEY_FRAGMENTS = [
  'cookie',
  'access_token',
  'refresh_token',
  'bearer',
  'authorization',
  'password',
  'secret',
  'credential',
  'ciphertext',
  'encrypted_blob',
  'session',
  'oauth',
  'raw_response',
  'gemini_response',
  'browser_session',
] as const;

const TOKEN_LIKE = /\b(ya29\.[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export interface OperationalSanitizeOptions {
  sanitizeEmail?: boolean;
}

export function sanitizeOperationalText(
  value: string | null | undefined,
  options: OperationalSanitizeOptions = {},
): string {
  if (value == null) return '';
  let text = String(value);
  text = text.replace(TOKEN_LIKE, '[REDACTED_TOKEN]');
  if (options.sanitizeEmail !== false) {
    text = text.replace(EMAIL_RE, (email) => maskEmail(email));
  }
  return text;
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '[REDACTED_EMAIL]';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function sanitizeOperationalJson(
  value: unknown,
  options: OperationalSanitizeOptions = {},
): string {
  if (value == null) return '';
  try {
    const redacted = redactUnknown(value, options, '');
    return sanitizeOperationalText(JSON.stringify(redacted), options);
  } catch {
    return sanitizeOperationalText(String(value), options);
  }
}

function redactUnknown(
  value: unknown,
  options: OperationalSanitizeOptions,
  path: string,
): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return sanitizeOperationalText(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactUnknown(item, options, `${path}[${index}]`));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_KEY_FRAGMENTS.some((frag) => lower.includes(frag))) {
        out[key] = '[REDACTED]';
        continue;
      }
      out[key] = redactUnknown(nested, options, `${path}.${key}`);
    }
    return out;
  }
  return value;
}
