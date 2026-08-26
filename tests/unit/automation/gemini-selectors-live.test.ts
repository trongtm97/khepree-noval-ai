import { describe, expect, it } from 'vitest';
import { GOOGLE_GEMINI_SELECTORS } from '../../../src/main/automation/providers/google/selectors/google-gemini.selectors';

describe('GOOGLE_GEMINI_SELECTORS live coverage', () => {
  it('keeps fixture appShell strategies first', () => {
    const strategies = GOOGLE_GEMINI_SELECTORS.appShell.strategies;
    expect(strategies[0]).toMatchObject({ kind: 'testId', testId: 'gemini-app' });
    expect(strategies[1]).toMatchObject({ kind: 'css', css: '[data-gemini-app]' });
  });

  it('includes live NotebookLM / Gemini shell fallbacks', () => {
    const css = GOOGLE_GEMINI_SELECTORS.appShell.strategies
      .filter((s) => s.kind === 'css')
      .map((s) => s.css);
    expect(css).toEqual(expect.arrayContaining(['labs-tailwind-root', 'rich-textarea', 'query-box']));
  });

  it('prefers enabled Send button strategies before disabled role match', () => {
    const css = GOOGLE_GEMINI_SELECTORS.sendButton.strategies
      .filter((s) => s.kind === 'css')
      .map((s) => s.css);
    expect(css.some((c) => c.includes('actions-enter-button') && c.includes('not([disabled])'))).toBe(
      true,
    );
    expect(css.some((c) => c.includes('Gửi') && c.includes('not([disabled])'))).toBe(true);
  });

  it('promptInput prefers AI CHAT BATCH NotebookLM composer selectors', () => {
    const css = GOOGLE_GEMINI_SELECTORS.promptInput.strategies
      .filter((s) => s.kind === 'css')
      .map((s) => s.css);
    expect(css).toEqual(
      expect.arrayContaining([
        'textarea[aria-label="Hộp truy vấn"]',
        'textarea.query-box-input',
        'textarea[placeholder*="Đặt câu hỏi" i]',
      ]),
    );
    expect(css.some((c) => c.includes('discoverSourcesQuery'))).toBe(true);
    expect(css.some((c) => c === 'form textarea')).toBe(false);
    expect(css.some((c) => c.includes('aria-label*="query"'))).toBe(false);
  });

  it('promptInput label strategies do not use bare nhập (matches đã nhập)', () => {
    const labels = GOOGLE_GEMINI_SELECTORS.promptInput.strategies
      .filter((s) => s.kind === 'label')
      .map((s) => String(s.label));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).not.toMatch(/(^|[|])nhập([|]|$)/i);
    }
  });

  it('assistantResponse includes NotebookLM to-user bubbles', () => {
    const css = GOOGLE_GEMINI_SELECTORS.assistantResponse.strategies
      .filter((s) => s.kind === 'css')
      .map((s) => s.css);
    expect(css).toEqual(
      expect.arrayContaining([
        '.chat-message-pair .to-user-container .message-text-content',
        '.to-user-container .message-text-content',
      ]),
    );
  });
});
