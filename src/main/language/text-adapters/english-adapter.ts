import { normalizeDigits } from '../../import/chapter-detector/utils';
import { genericUnicodeAdapter } from './generic-unicode-adapter';
import type {
  ChapterHeadingMatch,
  EncodingHints,
  FilenameChapterMatch,
  TextLanguageAdapter,
} from './types';

export const englishTextAdapter: TextLanguageAdapter = {
  id: 'english',
  languageCodes: ['en'],

  detectChapterHeading(line: string): ChapterHeadingMatch | null {
    const trimmed = line.trim();
    const match = /^(?:Chapter|CHAPTER)\s+(\d+)\b([^\n]*)$/u.exec(trimmed);
    if (!match) return null;
    return {
      title: trimmed,
      ordinal: Number.parseInt(match[1], 10),
      confidence: 0.85,
      kind: 'english',
      detectorId: 'english-chapter',
    };
  },

  detectChapterFromFilename(fileBaseName: string): FilenameChapterMatch | null {
    const base = fileBaseName.replace(/\.txt$/i, '');
    const normalized = normalizeDigits(base);
    const match = /^chapter[_\s-]*(\d+)(?:[_\s-]+(.*))?$/i.exec(normalized);
    if (!match) return null;
    const chapterNumber = Number.parseInt(match[1], 10);
    if (!chapterNumber || chapterNumber <= 0) return null;
    return {
      chapterNumber,
      chapterTitle: (match[2] ? match[2].trim() : '') || base,
      confidence: 0.95,
    };
  },

  normalizeText: (raw: string) => genericUnicodeAdapter.normalizeText(raw),
  segmentParagraphs: (
    body: string,
    options?: Parameters<typeof genericUnicodeAdapter.segmentParagraphs>[1],
  ) => genericUnicodeAdapter.segmentParagraphs(body, options),

  normalizePunctuation(text: string): string {
    return text
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\u00A0/g, ' ');
  },

  extractCandidateEntities(text: string): string[] {
    const found = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
    return [...new Set(found)].slice(0, 80);
  },

  estimateTextUnits(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  },

  encodingHints(): EncodingHints {
    return { legacyEncodings: [], minConfidence: 1 };
  },
};
