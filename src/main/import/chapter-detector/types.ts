import type { SegmentedParagraph } from '../paragraphs/segment';

export interface ChapterBoundaryCandidate {
  /** Absolute offset into full text (character index). */
  offset: number;
  /** Line index (0-based) in line-split text. */
  lineIndex: number;
  title: string;
  confidence: number;
  detectorId: string;
  /** Optional parsed ordinal (chapter/volume number). */
  ordinal?: number;
  kind: string;
}

export interface DetectedChapter {
  chapterNumber: number;
  title: string;
  /** Inclusive start offset in full text. */
  startOffset: number;
  /** Exclusive end offset. */
  endOffset: number;
  body: string;
  confidence: number;
  detectorIds: string[];
  isDuplicateTitle: boolean;
  isDuplicateHash: boolean;
  sourceHash: string;
  characterCount: number;
  paragraphCount: number;
  paragraphs: SegmentedParagraph[];
}

export interface ChapterDetectionResult {
  chapters: DetectedChapter[];
  overallConfidence: number;
  warnings: string[];
}
