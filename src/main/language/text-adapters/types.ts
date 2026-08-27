import type { SegmentParagraphsOptions, SegmentedParagraph } from '../../import/paragraphs/segment';

export interface ChapterHeadingMatch {
  title: string;
  ordinal?: number;
  confidence: number;
  kind: string;
  detectorId: string;
}

export interface FilenameChapterMatch {
  chapterNumber: number;
  chapterTitle: string;
  confidence: number;
}

/**
 * Legacy encodings an adapter may attempt after UTF-8 fails / is ambiguous.
 * Generic path never forces these — only the owning adapter may.
 */
export interface EncodingHints {
  /** iconv / jschardet names, e.g. gb18030, gbk, shift_jis, euc-kr */
  legacyEncodings: readonly string[];
  /** Minimum jschardet confidence before trying a legacy encoding. */
  minConfidence: number;
}

export interface DecodeAttempt {
  text: string;
  encoding: string;
  confidence: number;
}

export interface TextLanguageAdapter {
  readonly id: string;
  /** Language codes this adapter owns (normalized BCP-47-ish). */
  readonly languageCodes: readonly string[];

  detectChapterHeading(line: string): ChapterHeadingMatch | null;
  detectChapterFromFilename(fileBaseName: string): FilenameChapterMatch | null;
  normalizeText(raw: string): string;
  segmentParagraphs(
    body: string,
    options?: SegmentParagraphsOptions,
  ): SegmentedParagraph[];
  normalizePunctuation(text: string): string;
  extractCandidateEntities(text: string): string[];
  estimateTextUnits(text: string): number;
  encodingHints(): EncodingHints;
  /**
   * Optional legacy decode after UTF-8 path.
   * Return null when confidence too low — never force unsafe decoding.
   */
  tryDecodeLegacy?(buffer: Buffer, detectedName: string | null, detectedConfidence: number): DecodeAttempt | null;
}
