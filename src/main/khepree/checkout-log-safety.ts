/** Redact payment URLs and session ids before logging. */
import { sanitizeLogContext } from '../security/log-sanitize';

export function redactCheckoutLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  return sanitizeLogContext(fields);
}
