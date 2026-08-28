import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';
import { detectAndDecode } from '@main/import/encoding';
import { detectChapters } from '@main/import/chapter-detector';
import {
  chineseTextAdapter,
  englishTextAdapter,
  genericUnicodeAdapter,
  getTextLanguageAdapter,
  japaneseTextAdapter,
  koreanTextAdapter,
  detectFilenameWithAdapters,
  detectHeadingWithAdapters,
} from '@main/language/text-adapters';
import { getLanguageProfile } from '@shared/constants/language-profile';

describe('TextLanguageAdapter registry', () => {
  it('resolves language adapters; unknown → generic', () => {
    expect(getTextLanguageAdapter('zh-Hans').id).toBe('chinese');
    expect(getTextLanguageAdapter('en').id).toBe('english');
    expect(getTextLanguageAdapter('ja').id).toBe('japanese');
    expect(getTextLanguageAdapter('ko').id).toBe('korean');
    expect(getTextLanguageAdapter('vi').id).toBe('generic-unicode');
    expect(getTextLanguageAdapter(null).id).toBe('generic-unicode');
  });
});

describe('chapter heading patterns', () => {
  it('Chinese: 第123章', () => {
    const hit = chineseTextAdapter.detectChapterHeading('第123章 天地异变');
    expect(hit?.ordinal).toBe(123);
    expect(hit?.detectorId).toBe('chinese-chapter');
  });

  it('English: Chapter 123', () => {
    const hit = englishTextAdapter.detectChapterHeading('Chapter 123 The Beginning');
    expect(hit?.ordinal).toBe(123);
    expect(hit?.detectorId).toBe('english-chapter');
  });

  it('Japanese: 第123話 / 第123章', () => {
    expect(japaneseTextAdapter.detectChapterHeading('第123話')?.ordinal).toBe(123);
    expect(japaneseTextAdapter.detectChapterHeading('第45章 開幕')?.ordinal).toBe(45);
  });

  it('Korean: 제123화 / 123화', () => {
    expect(koreanTextAdapter.detectChapterHeading('제123화')?.ordinal).toBe(123);
    expect(koreanTextAdapter.detectChapterHeading('45화 시작')?.ordinal).toBe(45);
  });

  it('Generic: weak Ch. abbrev only', () => {
    expect(genericUnicodeAdapter.detectChapterHeading('Ch. 12')?.ordinal).toBe(12);
    expect(genericUnicodeAdapter.detectChapterHeading('第12章')).toBeNull();
    expect(genericUnicodeAdapter.detectChapterHeading('Chapter 12')).toBeNull();
  });

  it('unknown language scans all adapters', () => {
    expect(detectHeadingWithAdapters('第88章')?.ordinal).toBe(88);
    expect(detectHeadingWithAdapters('Chapter 9')?.ordinal).toBe(9);
    expect(detectHeadingWithAdapters('제7화')?.ordinal).toBe(7);
  });
});

describe('filename chapter patterns', () => {
  it('language-specific filenames', () => {
    expect(detectFilenameWithAdapters('第501章 天地.txt', 'zh-Hans')?.chapterNumber).toBe(501);
    expect(detectFilenameWithAdapters('Chapter 123.txt', 'en')?.chapterNumber).toBe(123);
    expect(detectFilenameWithAdapters('第12話.txt', 'ja')?.chapterNumber).toBe(12);
    expect(detectFilenameWithAdapters('제99화.txt', 'ko')?.chapterNumber).toBe(99);
  });

  it('generic numeric / chuong filenames', () => {
    expect(detectFilenameWithAdapters('1.txt')?.chapterNumber).toBe(1);
    expect(detectFilenameWithAdapters('Chuong_501.txt')?.chapterNumber).toBe(501);
    expect(genericUnicodeAdapter.detectChapterFromFilename('第501章.txt')).toBeNull();
  });
});

describe('detectChapters via adapters', () => {
  it('detects mixed languages when sourceLanguage unset', () => {
    const text = ['第1章 开端', '正文。', '', 'Chapter 2 Next', 'More.'].join('\n');
    const result = detectChapters(text);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
  });

  it('scopes to English when sourceLanguage=en', () => {
    const text = ['Chapter 1 Start', 'Hello.', '', '第2章', '不应算。'].join('\n');
    const result = detectChapters(text, { sourceLanguage: 'en' });
    expect(result.chapters.map((c) => c.title)).toContain('Chapter 1 Start');
    expect(result.chapters.every((c) => !c.title.includes('第'))).toBe(true);
  });
});

describe('encoding via adapters', () => {
  it('UTF-8 preferred', () => {
    const buf = Buffer.from('第1章\n内容', 'utf8');
    expect(detectAndDecode(buf).encoding).toBe('utf-8');
  });

  it('GBK via Chinese adapter / high-conf detection', () => {
    const text = '第一章 开端\n林风走在路上。';
    const buf = iconv.encode(text, 'gbk');
    const withLang = detectAndDecode(buf, { sourceLanguage: 'zh-Hans' });
    expect(['gbk', 'gb18030']).toContain(withLang.encoding);
    expect(withLang.text).toContain('林风');

    const auto = detectAndDecode(buf);
    expect(['gbk', 'gb18030']).toContain(auto.encoding);
  });

  it('generic path does not force GB18030', () => {
    // Random non-UTF8 bytes that are not confidently GB*
    const buf = Buffer.from([0xff, 0xfe, 0x00, 0x41, 0x00, 0x42]);
    const result = detectAndDecode(buf, { sourceLanguage: 'en' });
    expect(result.encoding).not.toBe('gb18030');
    expect(result.encoding).not.toBe('gbk');
  });
});

describe('RTL direction on LanguageProfile', () => {
  it('Arabic and Hebrew are rtl; CJK/English are ltr', () => {
    expect(getLanguageProfile('ar').direction).toBe('rtl');
    expect(getLanguageProfile('he').direction).toBe('rtl');
    expect(getLanguageProfile('zh-Hans').direction).toBe('ltr');
    expect(getLanguageProfile('en').direction).toBe('ltr');
  });
});
