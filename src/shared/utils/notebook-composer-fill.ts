import type { Locator } from 'playwright';
import { createHash } from 'node:crypto';

/** Set textarea/contenteditable so Angular Material formControl sees the value. */
export async function setAngularComposerValue(
  locator: Locator,
  text: string,
): Promise<void> {
  await locator.evaluate((el, value) => {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus();
      const proto =
        el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) {
        desc.set.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value,
          inputType: 'insertText',
        }),
      );
      return;
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value,
          inputType: 'insertText',
        }),
      );
    }
  }, text);
}

export async function readComposerCharCount(locator: Locator): Promise<number> {
  return (await readComposerText(locator)).length;
}

/** Raw composer value (textarea value or contenteditable text). */
export async function readComposerText(locator: Locator): Promise<string> {
  return locator
    .evaluate((el) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return el.value;
      }
      return el.textContent;
    })
    .catch(() => '');
}

/** Normalize for fill verification (stable across UI whitespace quirks). */
export function normalizeComposerText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').normalize('NFC');
}

export function hashComposerText(text: string): string {
  return createHash('sha256')
    .update(normalizeComposerText(text), 'utf8')
    .digest('hex')
    .slice(0, 16);
}

export type ComposerFillVerdict = 'ok' | 'truncated' | 'mismatch';

/**
 * Compare intended payload vs what the composer holds after fill.
 * Truncation → caller should raise PROMPT_TOO_LARGE.
 */
export function verifyComposerPayload(
  expectedRaw: string,
  actualRaw: string,
): ComposerFillVerdict {
  const expected = normalizeComposerText(expectedRaw);
  const actual = normalizeComposerText(actualRaw);
  if (!actual) return 'mismatch';
  if (actual === expected) return 'ok';

  const prefixLen = Math.min(64, expected.length, actual.length);
  const suffixLen = Math.min(64, expected.length);
  const prefixOk =
    prefixLen === 0 || actual.slice(0, prefixLen) === expected.slice(0, prefixLen);
  const suffixOk =
    suffixLen === 0 ||
    (actual.length >= suffixLen &&
      actual.slice(-suffixLen) === expected.slice(-suffixLen));

  if (hashComposerText(expected) === hashComposerText(actual) && prefixOk && suffixOk) {
    return 'ok';
  }

  // Same start, shorter body → UI/model truncated the prompt.
  if (prefixOk && actual.length < expected.length) {
    const minAccept = Math.max(32, Math.floor(expected.length * 0.95));
    if (actual.length < minAccept || !suffixOk) {
      return 'truncated';
    }
  }

  if (prefixOk && suffixOk && Math.abs(actual.length - expected.length) <= 2) {
    return 'ok';
  }

  return 'mismatch';
}

/** True when composer holds enough of the payload for Send to enable. */
export function composerFillLooksValid(payloadChars: number, actualChars: number): boolean {
  if (actualChars <= 0) return false;
  if (payloadChars <= 0) return true;
  // Allow small UI/normalization loss; reject clear truncation.
  const minOk = Math.min(payloadChars, Math.max(32, Math.floor(payloadChars * 0.85)));
  return actualChars >= minOk;
}
