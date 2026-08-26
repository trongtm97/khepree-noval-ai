import { describe, expect, it } from 'vitest';
import { decidePreprocessMode } from '../../../src/shared/constants/notebooklm-preprocess-auto';

describe('decidePreprocessMode', () => {
  it('picks quick for small novels', () => {
    expect(
      decidePreprocessMode({ chapterCount: 10, totalChars: 40_000 }),
    ).toBe('quick');
  });

  it('picks full when over chapter cap', () => {
    expect(
      decidePreprocessMode({ chapterCount: 21, totalChars: 10_000 }),
    ).toBe('full');
  });

  it('picks full when over char budget', () => {
    expect(
      decidePreprocessMode({ chapterCount: 5, totalChars: 90_000 }),
    ).toBe('full');
  });

  it('forceFull overrides quick', () => {
    expect(
      decidePreprocessMode({
        chapterCount: 3,
        totalChars: 1000,
        forceFull: true,
      }),
    ).toBe('full');
  });
});
