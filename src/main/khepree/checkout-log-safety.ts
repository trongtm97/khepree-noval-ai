/** Redact payment URLs and session ids before logging. */
export function redactCheckoutLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/checkouturl|checkout_url|sessionid|session_id|card|cvv|secret|token/i.test(key)) {
      redacted[key] = '[redacted]';
    } else if (typeof value === 'string' && value.includes('account.khepree.com/checkout')) {
      redacted[key] = '[redacted-checkout-url]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
