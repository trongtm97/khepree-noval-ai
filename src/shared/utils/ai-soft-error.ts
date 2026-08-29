/**
 * AI providers sometimes return polite error bubbles as "successful" chat text.
 * Treat these as provider failures — never as translation output.
 */

import {
  geminiSoftErrorSnippet,
  isGeminiSoftErrorText,
} from './gemini-soft-error';

const CHATGPT_SOFT_ERROR_PATTERNS: RegExp[] = [
  /something went wrong/i,
  /rate limit/i,
  /too many requests/i,
  /please try again later/i,
];

const META_AI_SOFT_ERROR_PATTERNS: RegExp[] = [
  /something went wrong/i,
  /unable to respond/i,
  /try again/i,
  /rate limit/i,
];

function matchesExtraSoftError(text: string): boolean {
  return (
    CHATGPT_SOFT_ERROR_PATTERNS.some((re) => re.test(text)) ||
    META_AI_SOFT_ERROR_PATTERNS.some((re) => re.test(text))
  );
}

/** True when raw AI text is a soft-error, not a translation payload. */
export function isAiSoftErrorText(raw: string | null | undefined): boolean {
  if (isGeminiSoftErrorText(raw)) return true;
  if (!raw) return false;
  const text = raw.trim();
  if (text.length === 0 || text.length > 800) return false;
  if (/<(TRANSLATION|TERM_DELTA|MEMORY_DELTA)>/i.test(text)) return false;
  if (/\[C\d{6}:P\d{6}\]/.test(text)) return false;
  return matchesExtraSoftError(text);
}

export { geminiSoftErrorSnippet, isGeminiSoftErrorText };
