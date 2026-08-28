import { describe, expect, it } from 'vitest';
import {
  TRANSLATION_LANGUAGE_PAIR_MISSING,
  TranslationLanguagePairMissingError,
} from '@shared/constants/translation-language';
import {
  isLegacyLanguagePairFallbackAllowed,
  resolveProjectSourceLanguageForProduction,
} from '@main/services/translation-language-resolver';

describe('TranslationLanguageResolver (pure)', () => {
  it('isLegacyLanguagePairFallbackAllowed only for LEGACY_IMPORT', () => {
    expect(isLegacyLanguagePairFallbackAllowed({ source_mode: 'LEGACY_IMPORT' })).toBe(true);
    expect(isLegacyLanguagePairFallbackAllowed({ source_mode: 'FOLDER' })).toBe(false);
  });

  it('resolveProjectSourceLanguageForProduction uses detected source_language', () => {
    expect(
      resolveProjectSourceLanguageForProduction({
        source_language: 'ja',
        source_mode: 'FOLDER',
      }),
    ).toBe('ja');
    expect(
      resolveProjectSourceLanguageForProduction({
        source_language: 'ko',
        source_mode: 'FOLDER',
      }),
    ).toBe('ko');
  });

  it('never uses hint — only source_language column', () => {
    expect(
      resolveProjectSourceLanguageForProduction({
        source_language: 'ja',
        source_mode: 'FOLDER',
      }),
    ).toBe('ja');
  });

  it('allows zh-Hans for LEGACY_IMPORT when source column empty', () => {
    expect(
      resolveProjectSourceLanguageForProduction({
        source_language: '',
        source_mode: 'LEGACY_IMPORT',
      }),
    ).toBe('zh-Hans');
  });

  it('throws TRANSLATION_LANGUAGE_PAIR_MISSING for modern project with empty source', () => {
    expect(() =>
      resolveProjectSourceLanguageForProduction({
        source_language: '',
        source_mode: 'FOLDER',
      }),
    ).toThrow(TranslationLanguagePairMissingError);
    try {
      resolveProjectSourceLanguageForProduction({
        source_language: '',
        source_mode: 'FOLDER',
      });
    } catch (e) {
      expect((e as TranslationLanguagePairMissingError).code).toBe(
        TRANSLATION_LANGUAGE_PAIR_MISSING,
      );
      expect((e as Error).message).toContain('Không xác định được cặp ngôn ngữ');
    }
  });
});
