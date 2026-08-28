import { describe, expect, it } from 'vitest';
import {
  formatAiLanguageIdentity,
  formatAiLanguageIdentityFromProfile,
  getLanguageProfile,
  normalizeLanguageCode,
} from '@shared/constants/language-profile';
import {
  formatLanguagePairPreamble,
  formatTranslationTaskHeader,
} from '@shared/constants/translation-style-model';

const HEADER_CODES = [
  'fa',
  'ur',
  'uk',
  'bg',
  'sr-Cyrl',
  'sr-Latn',
  'zh-Hans',
  'zh-Hant',
  'fil',
  'jv',
  'ar',
  'he',
  'hi',
  'bn',
  'th',
] as const;

describe('formatAiLanguageIdentity', () => {
  for (const code of HEADER_CODES) {
    it(`renders International / Native (code) for ${code}`, () => {
      const profile = getLanguageProfile(code);
      const label = formatAiLanguageIdentity(code);
      expect(label).toBe(
        `${profile.internationalName} / ${profile.nativeName} (${profile.code})`,
      );
      expect(label).not.toMatch(/Tiếng /);
      expect(label).toMatch(/\([^)]+\)$/);
    });
  }

  it('normalizes alias codes before label (jw → jv, iw → he, in → id)', () => {
    expect(formatAiLanguageIdentity('jw')).toBe(formatAiLanguageIdentity('jv'));
    expect(formatAiLanguageIdentity('jw')).toContain('(jv)');
    expect(formatAiLanguageIdentity('iw')).toContain('(he)');
    expect(formatAiLanguageIdentity('in')).toContain('(id)');
    expect(normalizeLanguageCode('jw')).toBe('jv');
    expect(normalizeLanguageCode('iw')).toBe('he');
    expect(normalizeLanguageCode('in')).toBe('id');
  });

  it('snapshot labels for catalog codes', () => {
    const labels = Object.fromEntries(
      HEADER_CODES.map((code) => [code, formatAiLanguageIdentity(code)]),
    );
    expect(labels).toMatchSnapshot();
  });
});

describe('formatTranslationTaskHeader', () => {
  it('uses detected-from-source and required-output guidance', () => {
    const header = formatTranslationTaskHeader({
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
      styleLabel: 'balanced',
      range: 'chapter 1',
    });
    expect(header).toContain('Source language:');
    expect(header).toContain('Japanese / 日本語 (ja)');
    expect(header).toContain('Detected from source content.');
    expect(header).toContain('Target language:');
    expect(header).toContain('Vietnamese / Tiếng Việt (vi)');
    expect(header).toContain('This is the required output language.');
    expect(header).toContain(
      'Translate:\nJapanese / 日本語 (ja) → Vietnamese / Tiếng Việt (vi)',
    );
    expect(header).not.toMatch(/user chose|displayNameVi|Tiếng Nhật/i);
  });

  it('includes target script metadata for RTL Arabic, not for Vietnamese', () => {
    const arTarget = formatTranslationTaskHeader({
      sourceLanguage: 'en',
      targetLanguage: 'ar',
      range: 'chapter 1',
    });
    expect(arTarget).toContain('Target script: Arab');
    expect(arTarget).toContain('Text direction: RTL');

    const viTarget = formatTranslationTaskHeader({
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
      range: 'chapter 1',
    });
    expect(viTarget).not.toContain('Target script:');
    expect(viTarget).not.toContain('Text direction:');
  });

  it('adds mixed-language guidance without listing secondary languages', () => {
    const header = formatTranslationTaskHeader({
      sourceLanguage: 'ja',
      targetLanguage: 'en',
      range: 'chapter 1',
      sourceMixedLanguage: true,
    });
    expect(header).toContain('embedded material in additional languages');
    expect(header).toContain('Treat primary language as Japanese');
    expect(header).not.toMatch(/secondary|French|Korean/i);
  });

  it('snapshot task headers for catalog codes → en', () => {
    const headers = Object.fromEntries(
      HEADER_CODES.map((code) => [
        code,
        formatTranslationTaskHeader({
          sourceLanguage: code,
          targetLanguage: 'en',
          range: 'chapter 1',
        }),
      ]),
    );
    expect(headers).toMatchSnapshot();
  });
});

describe('formatLanguagePairPreamble', () => {
  it('matches task header identity format', () => {
    const preamble = formatLanguagePairPreamble('zh-Hant', 'vi');
    expect(preamble).toContain(
      formatAiLanguageIdentityFromProfile(getLanguageProfile('zh-Hant')),
    );
    expect(preamble).toContain('Detected from source content.');
    expect(preamble).toContain('This is the required output language.');
  });
});
