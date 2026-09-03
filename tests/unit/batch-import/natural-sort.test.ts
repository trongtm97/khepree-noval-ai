import { describe, expect, it } from 'vitest';
import { naturalCompare, naturalSortStrings } from '@shared/utils/natural-sort';
import { toSafeDisplayPath } from '@shared/utils/safe-display-path';

describe('natural-sort', () => {
  it('orders numeric names stably (1 < 2 < 10)', () => {
    expect(naturalSortStrings(['ch10', 'ch2', 'ch1'])).toEqual(['ch1', 'ch2', 'ch10']);
  });

  it('sorts unicode titles stably', () => {
    const names = ['龍族 10', '龙族 2', 'Áo Giáp 1'];
    const sorted = naturalSortStrings(names);
    expect(sorted).toEqual([...names].sort(naturalCompare));
    expect(naturalCompare('Áo Giáp 1', 'Áo Giáp 1')).toBe(0);
  });
});

describe('toSafeDisplayPath', () => {
  it('returns relative path under root', () => {
    expect(toSafeDisplayPath('D:/novels', 'D:/novels/Book One/1.txt')).toBe('Book One/1.txt');
  });

  it('does not leak absolute paths outside root', () => {
    const shown = toSafeDisplayPath('D:/novels', 'C:/Windows/secret.txt');
    expect(shown).toBe('secret.txt');
    expect(shown.includes('C:')).toBe(false);
  });
});
