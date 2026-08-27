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

  it('exposes hybrid memory usage label', () => {
    expect(formatMemoryUsage('hybrid')).toBe(
      'Bộ nhớ sử dụng: Notebook + cập nhật cục bộ',
    );
  });

  it('returns null when empty', () => {
    expect(formatTranslateChannel({})).toBeNull();
  });
});
