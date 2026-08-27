import iconv from 'iconv-lite';
import { parseChineseOrdinal, normalizeDigits } from '../../import/chapter-detector/utils';
import { genericUnicodeAdapter } from './generic-unicode-adapter';
import type {
  ChapterHeadingMatch,
  DecodeAttempt,
  EncodingHints,
  FilenameChapterMatch,
  TextLanguageAdapter,
} from './types';

function cjkScore(text: string): number {
  const sample = text.slice(0, 8000);
  const cjk = sample.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const bad = sample.match(/\uFFFD/g)?.length ?? 0;
  return cjk - bad * 10;
}

export const chineseTextAdapter: TextLanguageAdapter = {
  id: 'chinese',
  languageCodes: ['zh-Hans', 'zh-Hant', 'zh'],

  detectChapterHeading(line: string): ChapterHeadingMatch | null {
    const trimmed = line.trim();

    let match =
      /^正文[：:\s]+(第([零〇○两一二三四五六七八九十百千0-9０-９]+)章[^\n]*)$/u.exec(trimmed);
    if (match) {
      return {
        title: match[1].trim(),
        ordinal: parseChineseOrdinal(match[2]),
        confidence: 0.88,
        kind: 'prefixed',
        detectorId: 'chinese-zhengwen',
      };
    }

    match = /^第([零〇○两一二三四五六七八九十百千0-9０-９]+)章([^\n]*)$/u.exec(trimmed);
    if (match) {
      return {
        title: trimmed,
        ordinal: parseChineseOrdinal(match[1]),
        confidence: 0.92,
        kind: 'chapter',
        detectorId: 'chinese-chapter',
      };
    }

    match = /^卷([零〇○两一二三四五六七八九十百千0-9０-９]+)([^\n]*)$/u.exec(trimmed);
    if (match) {
      return {
        title: trimmed,
        ordinal: parseChineseOrdinal(match[1]),
        confidence: 0.7,
        kind: 'volume',
        detectorId: 'chinese-volume',
      };
    }

    match = /^第([零〇○两一二三四五六七八九十百千0-9０-９]+)卷([^\n]*)$/u.exec(trimmed);
    if (match) {
      return {
        title: trimmed,
        ordinal: parseChineseOrdinal(match[1]),
        confidence: 0.75,
        kind: 'volume',
        detectorId: 'chinese-volume-di',
      };
    }

    return null;
  },

  detectChapterFromFilename(fileBaseName: string): FilenameChapterMatch | null {
    const base = fileBaseName.replace(/\.txt$/i, '');
    const normalized = normalizeDigits(base);
    const match = /^第([零〇○两一二三四五六七八九十百千0-9０-９]+)章(.*)$/u.exec(normalized);
    if (!match) return null;
    const chapterNumber = parseChineseOrdinal(match[1]);
    if (!chapterNumber || chapterNumber <= 0) return null;
    return {
      chapterNumber,
      chapterTitle: `第${match[1].trim()}章${match[2] ? match[2].trim() : ''}`.trim(),
      confidence: 0.95,
    };
  },

  normalizeText: genericUnicodeAdapter.normalizeText,
  segmentParagraphs: genericUnicodeAdapter.segmentParagraphs,

  normalizePunctuation(text: string): string {
    return text
      .replace(/\u3000/g, ' ')
      .replace(/[｡．]/g, '。')
      .replace(/[､]/g, '、');
  },

  extractCandidateEntities(text: string): string[] {
    const found = text.match(/[\u4e00-\u9fff]{2,4}/gu) ?? [];
    return [...new Set(found)].slice(0, 80);
  },

  estimateTextUnits(text: string): number {
    return Array.from(text.replace(/\s+/g, '')).length;
  },

  encodingHints(): EncodingHints {
    return {
      legacyEncodings: ['gb18030', 'gbk', 'gb2312'],
      minConfidence: 0.55,
    };
  },

  tryDecodeLegacy(
    buffer: Buffer,
    detectedName: string | null,
    detectedConfidence: number,
  ): DecodeAttempt | null {
    const hints = this.encodingHints();
    const name = (detectedName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapped =
      name === 'gb18030'
        ? 'gb18030'
        : name === 'gbk' || name === 'gb2312' || name === 'gb231280'
          ? 'gbk'
          : null;

    if (mapped && detectedConfidence >= hints.minConfidence) {
      const text = iconv.decode(buffer, mapped === 'gbk' ? 'gbk' : 'gb18030');
      return { text, encoding: mapped, confidence: detectedConfidence };
    }

    // Language is Chinese and UTF-8 failed — try GB18030 when it clearly wins on CJK density.
    try {
      const gb = iconv.decode(buffer, 'gb18030');
      const utf8 = buffer.toString('utf8');
      if (cjkScore(gb) > cjkScore(utf8) * 1.1) {
        return { text: gb, encoding: 'gb18030', confidence: Math.max(detectedConfidence, 0.45) };
      }
    } catch {
      /* ignore */
    }
    return null;
  },
};
