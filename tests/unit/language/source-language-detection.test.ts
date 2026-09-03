import { describe, expect, it, vi } from 'vitest';
import {
  buildLanguageDetectionSample,
} from '@main/language/build-language-detection-sample';
import {
  detectLanguageHeuristic,
  detectSourceLanguage,
} from '@main/language/language-detect';
import { resolveProjectSourceLanguage } from '@main/services/resolve-project-source-language';

const JA =
  'これは日本語の小説です。主人公は東京に住んでいます。ひらがなとカタカナが含まれます。';
const KO = '안녕하세요. 이것은 한국어 소설입니다. 주인공은 서울에 살고 있습니다.';
const ZH_HANS = '这是简体中文小说。主人公住在北京。故事发生在现代中国。';
const ZH_HANT =
  '這是繁體中文小說。主人公住在臺北。故事發生在現代台灣。國語門東車馬龍風這是繁體版本。';
const EN_WITH_JA_TERMS =
  'Chapter 1. The hero entered Tokyo and met Sakura at the station. She said konnichiwa briefly.';
const ZH_WITH_EN_NAMES =
  '第一章。李明走进了Starbucks咖啡店，点了一杯coffee。他对服务员说谢谢。';

describe('source language detection truth model', () => {
  it('TEST 1: no hint, Japanese text → ja', async () => {
    const r = await detectSourceLanguage({ sampleText: JA });
    expect(r.detectedLanguage).toBe('ja');
    expect(r.hintMismatch).toBe(false);
  });

  it('TEST 2: hint Korean, Japanese text → ja + mismatch', async () => {
    const r = await detectSourceLanguage({ sampleText: JA, hintCode: 'ko' });
    expect(r.detectedLanguage).toBe('ja');
    expect(r.hintMismatch).toBe(true);
    expect(r.hintCode).toBe('ko');
    expect(r.detectedLanguage).not.toBe(r.hintCode);
  });

  it('TEST 3: hint Japanese, Japanese text → match', async () => {
    const r = await detectSourceLanguage({ sampleText: JA, hintCode: 'ja' });
    expect(r.detectedLanguage).toBe('ja');
    expect(r.hintMismatch).toBe(false);
  });

  it('TEST 4: Chinese Simplified → zh-Hans', async () => {
    const r = await detectSourceLanguage({ sampleText: ZH_HANS });
    expect(r.detectedLanguage).toBe('zh-Hans');
  });

  it('TEST 5: Chinese Traditional → zh-Hant', async () => {
    const r = await detectSourceLanguage({ sampleText: ZH_HANT });
    expect(r.detectedLanguage).toBe('zh-Hant');
  });

  it('TEST 6: Japanese with kanji does not become Chinese when kana present', () => {
    const h = detectLanguageHeuristic(JA);
    expect(h.code).toBe('ja');
    expect(h.code).not.toBe('zh-Hans');
  });

  it('TEST 7: Korean → ko', async () => {
    const r = await detectSourceLanguage({ sampleText: KO });
    expect(r.detectedLanguage).toBe('ko');
  });

  it('TEST 8: English with Japanese terms → primary en', async () => {
    const r = await detectSourceLanguage({ sampleText: EN_WITH_JA_TERMS });
    expect(r.detectedLanguage).toBe('en');
  });

  it('TEST 9: Chinese novel with English proper names → primary Chinese', async () => {
    const r = await detectSourceLanguage({ sampleText: ZH_WITH_EN_NAMES });
    expect(['zh-Hans', 'zh-Hant']).toContain(r.detectedLanguage);
  });

  it('TEST 10: low confidence local triggers AI fallback', async () => {
    const aiDetect = vi.fn(() =>
      Promise.resolve({
        code: 'ja',
        confidence: 0.95,
        mixedLanguage: false,
        secondaryLanguages: [] as string[],
      }),
    );
    const r = await detectSourceLanguage({
      sampleText: 'x',
      aiDetect,
    });
    expect(aiDetect).toHaveBeenCalled();
    expect(r.detectedLanguage).toBe('ja');
    expect(r.method).toBe('AI');
  });

  it('TEST 11: high confidence local does not call AI', async () => {
    const aiDetect = vi.fn();
    await detectSourceLanguage({ sampleText: JA, aiDetect });
    expect(aiDetect).not.toHaveBeenCalled();
  });

  it('TEST 12: detected source equals target is detectable', async () => {
    const r = await detectSourceLanguage({ sampleText: JA });
    expect(r.detectedLanguage === 'ja').toBe(true);
  });

  it('TEST 14: hint never overrides detected when mismatch', async () => {
    const r = await detectSourceLanguage({ sampleText: JA, hintCode: 'ko' });
    expect(r.detectedLanguage).not.toBe(r.hintCode);
    expect(resolveProjectSourceLanguage({ source_language: r.detectedLanguage, source_mode: 'FOLDER' } as never)).toBe('ja');
  });
});

describe('buildLanguageDetectionSample', () => {
  it('uses body text not filename only', () => {
    const sample = buildLanguageDetectionSample({
      chapters: [
        {
          chapterNumber: 1,
          chapterTitle: 'chapter-01.txt',
          sourceFilePath: '/tmp/ch1.txt',
          bodyText: JA,
        },
      ],
    });
    expect(sample.length).toBeGreaterThan(20);
    expect(sample).toContain('日本語');
  });
});

describe('resolveProjectSourceLanguage', () => {
  it('uses detected column not hint', () => {
    expect(
      resolveProjectSourceLanguage({
        source_language: 'ja',
        source_language_hint: 'ko',
        source_mode: 'FOLDER',
      } as never),
    ).toBe('ja');
  });
});
