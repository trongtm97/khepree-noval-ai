import {
  segmentParagraphs as coreSegmentParagraphs,
  type SegmentParagraphsOptions,
  type SegmentedParagraph,
} from '../../import/paragraphs/segment';
import { normalizeNovelText } from '../../import/paragraphs/normalize';
import { normalizeDigits } from '../../import/chapter-detector/utils';
import type {
  EncodingHints,
  FilenameChapterMatch,
  ChapterHeadingMatch,
  TextLanguageAdapter,
} from './types';

/**
 * Default adapter — script-agnostic Unicode helpers.
 * No Chinese/Japanese/Korean-specific chapter or encoding rules.
 */
export const genericUnicodeAdapter: TextLanguageAdapter = {
  id: 'generic-unicode',
  languageCodes: [],

  detectChapterHeading(line: string): ChapterHeadingMatch | null {
    const trimmed = line.trim();
    // Weak generic: "Ch. 12" / "Ch 12" only — not language-branded novels.
    const match = /^(?:Ch\.?|Chap\.?)\s+(\d+)\b([^\n]*)$/iu.exec(trimmed);
    if (!match) return null;
    return {
      title: trimmed,
      ordinal: Number.parseInt(match[1], 10),
      confidence: 0.55,
      kind: 'generic-abbrev',
      detectorId: 'generic-ch-abbrev',
    };
  },

  detectChapterFromFilename(fileBaseName: string): FilenameChapterMatch | null {
    const base = fileBaseName.replace(/\.txt$/i, '');
    const normalized = normalizeDigits(base);
    const patterns: RegExp[] = [
      /^(\d+)$/,
      /^chuong[_\s-]*(\d+)$/i,
      /^(\d+)\s*[-–—]\s*(.+)$/,
      /^(.+?)[_\s-]*(\d+)$/,
    ];
    for (const regex of patterns) {
      const match = regex.exec(normalized);
      if (!match) continue;
      let chapterNumber: number;
      let chapterTitle = base;
      if (regex.source.startsWith('^(.+?)')) {
        chapterNumber = Number.parseInt(match[2], 10);
        chapterTitle = match[1].trim() || base;
      } else {
        chapterNumber = Number.parseInt(match[1], 10);
        if (match[2]) chapterTitle = match[2].trim() || base;
      }
      if (!chapterNumber || chapterNumber <= 0 || !Number.isFinite(chapterNumber)) continue;
      return { chapterNumber, chapterTitle, confidence: 0.9 };
    }
    return null;
  },

  normalizeText(raw: string): string {
    return normalizeNovelText(raw);
  },

  segmentParagraphs(
    body: string,
    options?: SegmentParagraphsOptions,
  ): SegmentedParagraph[] {
    return coreSegmentParagraphs(body, options);
  },

  normalizePunctuation(text: string): string {
    // Generic: unify fancy spaces; leave script punctuation alone.
    return text.replace(/\u00A0/g, ' ').replace(/[ \t]+\n/g, '\n');
  },

  extractCandidateEntities(_text: string): string[] {
    return [];
  },

  estimateTextUnits(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const whitespace = trimmed.split(/\s+/).filter(Boolean);
    if (whitespace.length > 1 || /\s/.test(trimmed)) {
      return whitespace.length;
    }
    return Array.from(trimmed).length;
  },

  encodingHints(): EncodingHints {
    return { legacyEncodings: [], minConfidence: 1 };
  },
};
