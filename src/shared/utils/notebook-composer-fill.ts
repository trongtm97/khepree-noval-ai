import type { Locator } from 'playwright';

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
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
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
  return locator
    .evaluate((el) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return el.value.length;
      }
      return (el.textContent ?? '').length;
    })
    .catch(() => 0);
}

/** True when composer holds enough of the payload for Send to enable. */
export function composerFillLooksValid(payloadChars: number, actualChars: number): boolean {
  if (actualChars <= 0) return false;
  if (payloadChars <= 0) return true;
  // Allow small UI/normalization loss; reject clear truncation.
  const minOk = Math.min(payloadChars, Math.max(32, Math.floor(payloadChars * 0.85)));
  return actualChars >= minOk;
}
