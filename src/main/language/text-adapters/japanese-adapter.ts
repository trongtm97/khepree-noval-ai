import { normalizeDigits } from '../../import/chapter-detector/utils';
import { genericUnicodeAdapter } from './generic-unicode-adapter';
import type {
  ChapterHeadingMatch,
  DecodeAttempt,
  EncodingHints,
  FilenameChapterMatch,
  TextLanguageAdapter,
} from './types';

/**
 * Japanese adapter.
 * Shift-JIS is declared in encodingHints but only applied when jschardet
 * confidence clears the threshold — no unsafe forced decode.
 */
export const japaneseTextAdapter: TextLanguageAdapter = {
  id: 'japanese',
  languageCodes: ['ja'],

  detectChapterHeading(line: string): ChapterHeadingMatch | null {
    const trimmed = line.trim();
    // 第123話 / 第123章 / 第十二話
    const match =
      /^第([零〇一二三四五六七八九十百千0-9０-９]+)([話章])([^\n]*)$/u.exec(trimmed);
    if (!match) return null;
    const raw = normalizeDigits(match[1]);
    const ordinal = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : undefined;
    return {
      title: trimmed,
      ordinal: ordinal && ordinal > 0 ? ordinal : undefined,
      confidence: 0.9,
      kind: match[2] === '話' ? 'wa' : 'chapter',
      detectorId: 'japanese-chapter',
    };
  },

  detectChapterFromFilename(fileBaseName: string): FilenameChapterMatch | null {
    const base = fileBaseName.replace(/\.txt$/i, '');
    const normalized = normalizeDigits(base);
    const match = /^第([0-9０-９]+)([話章])(.*)$/u.exec(normalized);
    if (!match) return null;
    const chapterNumber = Number.parseInt(normalizeDigits(match[1]), 10);
    if (!chapterNumber || chapterNumber <= 0) return null;
    return {
      chapterNumber,
      chapterTitle: `第${match[1]}${match[2]}${match[3] ?? ''}`.trim(),
      confidence: 0.95,
    };
  },

  normalizeText: genericUnicodeAdapter.normalizeText,
  segmentParagraphs: genericUnicodeAdapter.segmentParagraphs,

  normalizePunctuation(text: string): string {
    return text.replace(/\u3000/g, ' ');
  },

  extractCandidateEntities(text: string): string[] {
    const found = text.match(/[\u3040-\u30ff\u4e00-\u9fff]{2,8}/gu) ?? [];
    return [...new Set(found)].slice(0, 80);
  },

  estimateTextUnits(text: string): number {
    return Array.from(text.replace(/\s+/g, '')).length;
  },

  encodingHints(): EncodingHints {
    return {
      legacyEncodings: ['shift_jis', 'windows-31j', 'cp932'],
      minConfidence: 0.92,
    };
  },

  tryDecodeLegacy(
    _buffer: Buffer,
    detectedName: string | null,
    detectedConfidence: number,
  ): DecodeAttempt | null {
    const hints = this.encodingHints();
    if (detectedConfidence < hints.minConfidence) return null;
    const name = (detectedName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!['shiftjis', 'sjis', 'windows31j', 'cp932'].includes(name)) {
      return null;
    }
    // Architecture reserved — require high-confidence signal before enabling.
    // Unsafe blind Shift-JIS decode intentionally omitted until confidence gates harden.
    return null;
  },
};
