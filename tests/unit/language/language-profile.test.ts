import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  canSwapLanguages,
  formatLanguagePairLabel,
  formatLanguagePairInline,
  formatLanguagePairStacked,
  getLanguageProfile,
  languageCompactLabel,
  listLanguageProfiles,
  normalizeLanguageCode,
  registerLanguageProfile,
} from '@shared/constants/language-profile';
import { formatTranslationTaskHeader } from '@shared/constants/translation-style-model';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import type { MemoryContextDto } from '@shared/schemas/memory';
import {
  detectLanguage,
  detectLanguageHeuristic,
} from '@main/language/language-detect';

const EMPTY_CONTEXT: MemoryContextDto = {
  activeTerms: [],
  activeCharacters: [],
  relationships: [],
  recentMemory: [],
  criticalProjectRules: [],
  anchorChapter: 1,
  recentWindow: { fromChapter: 1, toChapter: 1 },
  budget: { limit: 4000, estimated: 0, dropped: 0 },
};

describe('LanguageProfile registry', () => {
  it('lists builtin profiles and is extensible', () => {
    const before = listLanguageProfiles().length;
    expect(before).toBeGreaterThanOrEqual(100);
    registerLanguageProfile({
      code: 'it-test',
      internationalName: 'Italian',
      nativeName: 'Italiano',
      displayNameVi: 'Tiếng Ý',
      displayNameNative: 'Italiano',
      script: 'Latn',
      direction: 'ltr',
      regionGroup: 'EUROPE',
      aiSupportTier: 'GEMINI_EXTENDED',
      segmentationStrategy: 'whitespace',
      quoteStyle: 'curly',
      punctuationProfile: 'western',
      supportsTransliteration: false,
    });
    expect(listLanguageProfiles().some((p) => p.code === 'it-test')).toBe(true);
    expect(listLanguageProfiles().length).toBeGreaterThanOrEqual(before);
  });

  it('compact pair labels use native names, not BCP-47 codes', () => {
    expect(languageCompactLabel('zh-Hans')).toBe('中文');
    expect(formatLanguagePairLabel('zh-Hans', 'vi')).toBe('中文 → Tiếng Việt');
    expect(formatLanguagePairLabel('en', 'es')).toBe('English → Español');
    expect(formatLanguagePairLabel('zh-Hans', 'vi')).not.toMatch(/zh-Hans/);
  });

  it('stacked pair labels show international, native, and BCP-47 code', () => {
    const stacked = formatLanguagePairStacked('zh-Hans', 'vi');
    expect(stacked.internationalLine).toBe('Chinese (Simplified) → Vietnamese');
    expect(stacked.nativeLine).toBe('简体中文 · zh-Hans → Tiếng Việt · vi');
  });

  it('inline pair label combines intl/native/code on one line', () => {
    const inline = formatLanguagePairInline('zh-Hans', 'vi');
    expect(inline).toContain('Chinese (Simplified) / 简体中文 · zh-Hans');
    expect(inline).toContain('Vietnamese / Tiếng Việt · vi');
    expect(inline).toContain('→');
  });

  it('normalizes legacy zh → zh-Hans; defaults remain Chinese→Vietnamese', () => {
    expect(normalizeLanguageCode('zh')).toBe('zh-Hans');
    expect(normalizeLanguageCode('zh-CN')).toBe('zh-Hans');
    expect(normalizeLanguageCode('zh-TW')).toBe('zh-Hant');
    expect(DEFAULT_SOURCE_LANGUAGE).toBe('zh-Hans');
    expect(DEFAULT_TARGET_LANGUAGE).toBe('vi');
  });

  it('swap blocked for AUTO', () => {
    expect(canSwapLanguages('AUTO', 'vi')).toBe(false);
    expect(canSwapLanguages('zh-Hans', 'vi')).toBe(true);
  });
});

describe('language detection heuristic', () => {
  it('detects Japanese from kana sample', async () => {
    const r = await detectLanguage({
      sampleText: 'これは日本語の小説です。主人公は東京に住んでいます。',
    });
    expect(r.code).toBe('ja');
    expect(r.displayNameVi).toBe('Tiếng Nhật');
    expect(r.method).toBe('heuristic');
  });

  it('detects English with high confidence', () => {
    const r = detectLanguageHeuristic(
      'Chapter 1. The hero walked into the quiet town and said hello to the people.',
    );
    expect(r.code).toBe('en');
    expect(r.confidence).toBeGreaterThan(0.4);
  });
});

describe('pack prompts are language-pair driven', () => {
  const pairs: [string, string][] = [
    ['zh-Hans', 'vi'],
    ['en', 'vi'],
    ['ja', 'en'],
    ['vi', 'en'],
    ['es', 'vi'],
  ];

  for (const [source, target] of pairs) {
    it(`${source} → ${target} task header uses LanguageProfile (not hardcoded CN/VI)`, () => {
      const { sections } = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: [],
        context: EMPTY_CONTEXT,
        sourceLines: ['[C000001:P000001] hello'],
        sourceLanguage: source,
        targetLanguage: target,
      });
      const sourceName = getLanguageProfile(source).displayNameNative;
      const targetName = getLanguageProfile(target).displayNameNative;
      expect(sections.taskHeader).toContain(sourceName);
      expect(sections.taskHeader).toContain(targetName);
      expect(sections.taskHeader).not.toMatch(/Translate Chinese → Vietnamese/);
      expect(
        formatTranslationTaskHeader({
          sourceLanguage: source,
          targetLanguage: target,
          styleLabel: 'balanced',
          range: 'chapter 1',
        }),
      ).toContain(sourceName);
    });
  }
});

describe('AI detect injection', () => {
  it('calls AI only when heuristic is weak', async () => {
    let aiCalled = false;
    const r = await detectLanguage({
      sampleText: '??? !!! ###',
      aiDetect: () => {
        aiCalled = true;
        return Promise.resolve({ code: 'es', confidence: 0.8 });
      },
    });
    expect(aiCalled).toBe(true);
    expect(r.code).toBe('es');
    expect(r.method).toBe('ai');
  });
});
