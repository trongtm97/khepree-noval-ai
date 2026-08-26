import { describe, expect, it } from 'vitest';
import { formatTranslateChannel } from '@shared/utils/translate-channel';

describe('formatTranslateChannel', () => {
  it('formats Web API fat-pack', () => {
    expect(
      formatTranslateChannel({
        providerType: 'GEMINI_WEB_API',
        packMode: 'fat',
      }),
    ).toBe('Web API · fat-pack');
  });

  it('formats NotebookLM slim', () => {
    expect(
      formatTranslateChannel({
        providerType: 'PLAYWRIGHT_GEMINI',
        packMode: 'slim',
      }),
    ).toBe('NotebookLM · slim');
  });

  it('returns null when empty', () => {
    expect(formatTranslateChannel({})).toBeNull();
  });
});
