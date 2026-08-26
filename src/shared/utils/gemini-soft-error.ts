/**
 * Gemini sometimes returns a polite error bubble as "successful" chat text.
 * Treat these as provider failures — never as translation output.
 */

const SOFT_ERROR_PATTERNS: RegExp[] = [
  /^sorry,\s*something went wrong/i,
  /something went wrong\.?\s*please try (your request|again)/i,
  /i encountered an error doing what you asked/i,
  /i'?m having a hard time fulfilling your request/i,
  /could you try again\??\s*$/i,
  /can i help you with something else instead/i,
  /an error occurred(?:\s+while\s+.*)?\.?\s*please try again/i,
  /unable to (process|complete) (your )?(request|message)/i,
  /^đã xảy ra lỗi/i,
  /xin lỗi.+(đã xảy ra lỗi|thử lại)/i,
];

/** True when raw AI text is a Gemini soft-error, not a translation payload. */
export function isGeminiSoftErrorText(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const text = raw.trim();
  if (text.length === 0) return false;
  // Soft errors are short; real translation batches are long.
  if (text.length > 800) return false;
  // Real protocol output never matches these.
  if (/<(TRANSLATION|TERM_DELTA|MEMORY_DELTA)>/i.test(text)) return false;
  if (/\[C\d{6}:P\d{6}\]/.test(text)) return false;
  return SOFT_ERROR_PATTERNS.some((re) => re.test(text));
}

export function geminiSoftErrorSnippet(raw: string, max = 160): string {
  const oneLine = raw.trim().replace(/\s+/g, ' ');
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}
