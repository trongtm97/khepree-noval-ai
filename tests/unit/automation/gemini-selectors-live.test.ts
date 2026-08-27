import { describe, expect, it } from 'vitest';
import { GEMINI_CHAT_SELECTORS } from '../../../src/main/automation/providers/google/selectors/gemini-chat.selectors';
import { GEMINI_NOTEBOOK_SELECTORS } from '../../../src/main/automation/providers/google/selectors/gemini-notebook.selectors';
import { NOTEBOOKLM_SELECTORS } from '../../../src/main/automation/providers/google/selectors/notebooklm.selectors';
import { GOOGLE_GEMINI_SELECTORS } from '../../../src/main/automation/providers/google/selectors/google-gemini.selectors';

describe('Surface selector catalogs', () => {
  it('GOOGLE_GEMINI_SELECTORS aliases NOTEBOOKLM for backward compat', () => {
    expect(GOOGLE_GEMINI_SELECTORS.appShell.key).toBe(NOTEBOOKLM_SELECTORS.appShell.key);
  });

  it('GEMINI_CHAT keeps fixture appShell strategies first', () => {
    const strategies = GEMINI_CHAT_SELECTORS.appShell.strategies;
    expect(strategies[0]).toMatchObject({ kind: 'testId', testId: 'gemini-app' });
    expect(strategies[1]).toMatchObject({ kind: 'css', css: '[data-gemini-app]' });
  });

  it('GEMINI_NOTEBOOK shell is distinct from GEMINI_CHAT', () => {
    const ids = GEMINI_NOTEBOOK_SELECTORS.appShell.strategies
      .filter((s) => s.kind === 'testId')
      .map((s) => s.testId);
    expect(ids).toContain('gemini-notebook-app');
    expect(ids).not.toContain('gemini-app');
  });

  it('NOTEBOOKLM promptInput excludes Discover Sources and prefers accessible names', () => {
    const strategies = NOTEBOOKLM_SELECTORS.promptInput.strategies;
    expect(strategies.some((s) => s.kind === 'label')).toBe(true);
    expect(strategies.some((s) => s.kind === 'placeholder')).toBe(true);
    const css = strategies.filter((s) => s.kind === 'css').map((s) => s.css);
    expect(css.some((c) => c.includes('discoverSourcesQuery'))).toBe(true);
    expect(css.some((c) => c === 'form textarea')).toBe(false);
  });

  it('NOTEBOOKLM send prefers enabled actions-enter-button', () => {
    const css = NOTEBOOKLM_SELECTORS.sendButton.strategies
      .filter((s) => s.kind === 'css')
      .map((s) => s.css);
    expect(css.some((c) => c.includes('actions-enter-button') && c.includes('not([disabled])'))).toBe(
      true,
    );
  });

  it('assistantResponse strategies do not stack nested text + parent for NotebookLM', () => {
    const css = NOTEBOOKLM_SELECTORS.assistantResponse.strategies
      .filter((s) => s.kind === 'css')
      .map((s) => s.css);
    expect(css).toContain('.chat-message-pair .to-user-container');
    expect(css.some((c) => c.includes('message-text-content'))).toBe(false);
  });
});
