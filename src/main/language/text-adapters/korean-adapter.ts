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
 * Korean adapter.
 * EUC-KR declared for future use — only when detection confidence is high.
 */
export const koreanTextAdapter: TextLanguageAdapter = {
  id: 'korean',
  languageCodes: ['ko'],

  detectChapterHeading(line: string): ChapterHeadingMatch | null {
    const trimmed = line.trim();
    // 제123화 / 123화
    let match = /^제\s*([0-9０-９]+)\s*화([^\n]*)$/u.exec(trimmed);
    if (!match) {
      match = /^([0-9０-９]+)\s*화([^\n]*)$/u.exec(trimmed);
    }
    if (!match) return null;
    const chapterNumber = Number.parseInt(normalizeDigits(match[1]), 10);
    if (!chapterNumber || chapterNumber <= 0) return null;
    return {
      title: trimmed,
      ordinal: chapterNumber,
      confidence: 0.9,
      kind: 'hwa',
      detectorId: 'korean-chapter',
    };
  },

  detectChapterFromFilename(fileBaseName: string): FilenameChapterMatch | null {
    const base = fileBaseName.replace(/\.txt$/i, '');
    const normalized = normalizeDigits(base);
    let match = /^제\s*([0-9]+)\s*화(.*)$/u.exec(normalized);
    if (!match) {
      match = /^([0-9]+)\s*화(.*)$/u.exec(normalized);
    }
    if (!match) return null;
    const chapterNumber = Number.parseInt(match[1], 10);
    if (!chapterNumber || chapterNumber <= 0) return null;
    return {
      chapterNumber,
      chapterTitle: base,
      confidence: 0.95,
    };
  },

  normalizeText: genericUnicodeAdapter.normalizeText,
  segmentParagraphs: genericUnicodeAdapter.segmentParagraphs,

  normalizePunctuation(text: string): string {
    return text.replace(/\u3000/g, ' ');
  },

  extractCandidateEntities(text: string): string[] {
    const found = text.match(/[\uac00-\ud7af]{2,8}/gu) ?? [];
    return [...new Set(found)].slice(0, 80);
  },

  estimateTextUnits(text: string): number {
    return Array.from(text.replace(/\s+/g, '')).length;
  },

  encodingHints(): EncodingHints {
    return {
      legacyEncodings: ['euc-kr', 'cp949'],
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
    if (!['euckr', 'cp949', 'ksc5601'].includes(name)) return null;
    // Architecture reserved — no unsafe forced EUC-KR without hardened gates.
    return null;
  },
};
