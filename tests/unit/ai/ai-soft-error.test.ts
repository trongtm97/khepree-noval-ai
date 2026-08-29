import { describe, expect, it } from 'vitest';
import {
  isAiSoftErrorText,
  isGeminiSoftErrorText,
} from '../../../src/shared/utils/ai-soft-error';

describe('isAiSoftErrorText', () => {
  it('detects Gemini soft errors', () => {
    expect(isAiSoftErrorText('Sorry, something went wrong. Please try again.')).toBe(true);
  });

  it('detects ChatGPT-style errors', () => {
    expect(isAiSoftErrorText('Something went wrong. Rate limit exceeded.')).toBe(true);
  });

  it('rejects real translation markers', () => {
    expect(
      isAiSoftErrorText('[C000001:P000001] Hello world\n<TRANSLATION>\nLine</TRANSLATION>'),
    ).toBe(false);
  });

  it('isGeminiSoftErrorText alias still works', () => {
    expect(isGeminiSoftErrorText('Something went wrong')).toBe(false);
    expect(isGeminiSoftErrorText('Sorry, something went wrong')).toBe(true);
  });
});
