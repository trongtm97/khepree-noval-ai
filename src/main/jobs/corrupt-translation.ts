/** Detect translation lines that must not PASS QA — protocol leak or obvious truncate. */

const PROTOCOL_TAG_RE =
  /<\/?(?:TRANSLATION|TERM_DELTA|MEMORY_DELTA)\b[^>]*>/i;

/** Trailing incomplete open tag: `...<` or `...</` without a complete tag. */
const INCOMPLETE_TAG_TAIL_RE = /<\/?[A-Za-z_]*$/;

const TERMINAL_PUNCT_RE = /[.!?…」』”"]\s*$/u;

/** Dangling continuation fragment (e.g. ", vui vẻ hơn rất nhiều"). */
const LEADING_FRAGMENT_RE = /^\s*[,;、]/u;

const MIN_SOURCE_FOR_RATIO = 40;
const MIN_RATIO = 0.15;
const MAX_FRAGMENT_LEN = 50;

/**
 * Returns true when translation text is corrupt and should be re-translated.
 * Does not mutate or strip text.
 */
export function isCorruptTranslationText(
  text: string,
  sourceText?: string,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (PROTOCOL_TAG_RE.test(trimmed)) return true;
  if (INCOMPLETE_TAG_TAIL_RE.test(trimmed)) return true;

  if (
    LEADING_FRAGMENT_RE.test(trimmed) &&
    trimmed.length <= MAX_FRAGMENT_LEN &&
    !TERMINAL_PUNCT_RE.test(trimmed)
  ) {
    return true;
  }

  if (sourceText != null && sourceText.length >= MIN_SOURCE_FOR_RATIO) {
    const ratio = trimmed.length / sourceText.length;
    if (ratio < MIN_RATIO && !TERMINAL_PUNCT_RE.test(trimmed)) {
      return true;
    }
  }

  return false;
}
