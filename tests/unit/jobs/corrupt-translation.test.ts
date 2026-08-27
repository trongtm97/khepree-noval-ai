import { describe, expect, it } from 'vitest';
import { isCorruptTranslationText } from '../../../src/main/jobs/corrupt-translation';

describe('isCorruptTranslationText', () => {
  it('flags protocol tags leaked into body', () => {
    expect(
      isCorruptTranslationText('Hương khói đã tắt ng<TRANSLATION>'),
    ).toBe(true);
    expect(isCorruptTranslationText('ok </TRANSLATION> more')).toBe(true);
    expect(isCorruptTranslationText('x <TERM_DELTA>[]')).toBe(true);
    expect(isCorruptTranslationText('x </MEMORY_DELTA>')).toBe(true);
  });

  it('flags incomplete open tag at end', () => {
    expect(isCorruptTranslationText('đã tắt ng<')).toBe(true);
    expect(isCorruptTranslationText('đã tắt ng</TRANS')).toBe(true);
  });

  it('flags short truncate vs long source without terminal punct', () => {
    const source = '甲'.repeat(200);
    expect(isCorruptTranslationText(', vui vẻ hơn rất nhiều', source)).toBe(true);
  });

  it('flags dangling comma fragment even with short source', () => {
    expect(isCorruptTranslationText(', vui vẻ hơn rất nhiều', '短句。')).toBe(true);
  });

  it('allows short text that ends with terminal punct', () => {
    const source = '甲'.repeat(50);
    expect(isCorruptTranslationText('Xong.', source)).toBe(false);
  });

  it('allows clean full translation', () => {
    expect(
      isCorruptTranslationText(
        'Trong am yên tĩnh đến lạ kỳ.',
        '庵中安静得出奇。',
      ),
    ).toBe(false);
  });

  it('ignores empty (handled by empty_translation)', () => {
    expect(isCorruptTranslationText('   ')).toBe(false);
  });
});
