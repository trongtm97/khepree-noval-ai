import { describe, expect, it } from 'vitest';
import { formatMemoryUsage, formatTranslateChannel } from '@shared/utils/translate-channel';

describe('formatTranslateChannel', () => {
  it('formats Web API without packing packMode into channel string', () => {
    expect(
      formatTranslateChannel({
        providerType: 'GEMINI_WEB_API',
        packMode: 'fat',
      }),
    ).toBe('Đang dùng Gemini Web API + bộ nhớ cục bộ');
  });

  it('formats Notebook Playwright channel', () => {
    expect(
      formatTranslateChannel({
        providerType: 'PLAYWRIGHT_GEMINI',
        packMode: 'slim',
      }),
    ).toBe('Đang dùng Gemini Notebook');
  });

  it('exposes local context memory usage label', () => {
    expect(formatMemoryUsage('local_context')).toBe(
      'Bộ nhớ sử dụng: ngữ cảnh cục bộ (Local Context)',
    );
    expect(formatMemoryUsage('notebook_assisted')).toBe(
      'Bộ nhớ sử dụng: Notebook + ngữ cảnh cục bộ',
    );
  });

  it('returns null when empty', () => {
    expect(formatTranslateChannel({})).toBeNull();
  });
});
