import { sha256Text } from '../hash';
import type { SegmentedParagraph } from '../paragraphs/segment';
import { segmentParagraphs } from '../paragraphs/segment';
import { normalizeNovelText } from '../paragraphs/normalize';
import { DEFAULT_LINE_DETECTORS, lineDetectorsForLanguage } from './detectors';
import type { LineDetector } from './utils';
import type {
  ChapterBoundaryCandidate,
  ChapterDetectionResult,
  DetectedChapter,
} from './types';

export interface ChapterDetectorOptions {
  detectors?: LineDetector[];
  /** Treat volume headings as chapter boundaries (default true). */
  includeVolumes?: boolean;
  minConfidence?: number;
  /** Selects TextLanguageAdapter heading patterns when detectors omitted. */
  sourceLanguage?: string | null;
}

/**
 * Multi-detector pipeline: scan lines → merge nearby candidates → score → slice chapters.
 * Not a single regex.
 */
export function detectChapters(
  rawText: string,
  options: ChapterDetectorOptions = {},
): ChapterDetectionResult {
  const text = normalizeNovelText(rawText);
  const warnings: string[] = [];
  const detectors =
    options.detectors ??
    (options.sourceLanguage != null
      ? lineDetectorsForLanguage(options.sourceLanguage)
      : DEFAULT_LINE_DETECTORS);
  const includeVolumes = options.includeVolumes ?? true;
  const minConfidence = options.minConfidence ?? 0.55;

  const lines = text.split('\n');
  const candidates: ChapterBoundaryCandidate[] = [];
  let offset = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const detector of detectors) {
      const hit = detector.detectLine(line, i, offset);
      if (!hit) continue;
      if (!includeVolumes && hit.kind === 'volume') continue;
      if (hit.confidence < minConfidence) continue;
      // Prefer short heading lines (avoid matching mid-paragraph noise)
      if (line.trim().length > 80) continue;
      candidates.push(hit);
    }
    offset += line.length + 1;
  }

  const merged = mergeCandidates(candidates);
  if (merged.length === 0) {
    warnings.push('No chapter boundaries detected; treating entire file as one chapter.');
    const body = text;
    const paragraphs = segmentParagraphs(body);
    const chapter = buildChapter({
      chapterNumber: 1,
      title: '全文',
      startOffset: 0,
      endOffset: text.length,
      body,
      confidence: 0.3,
      detectorIds: ['fallback-whole'],
      paragraphs,
    });
    return {
      chapters: [chapter],
      overallConfidence: 0.3,
      warnings,
    };
  }

  // Optional prologue before first heading
  const chapters: DetectedChapter[] = [];
  const first = merged[0];
  if (first.offset > 0) {
    const prologue = text.slice(0, first.offset).trim();
    if (prologue.length > 40) {
      warnings.push('Content before first heading kept as prologue chapter.');
      const paragraphs = segmentParagraphs(prologue);
      chapters.push(
        buildChapter({
          chapterNumber: 0, // renumbered below
          title: '序章',
          startOffset: 0,
          endOffset: first.offset,
          body: prologue,
          confidence: 0.5,
          detectorIds: ['prologue'],
          paragraphs,
        }),
      );
    }
  }

  for (let i = 0; i < merged.length; i += 1) {
    const cur = merged[i];
    const next = i + 1 < merged.length ? merged[i + 1] : undefined;
    const end = next === undefined ? text.length : next.offset;
    const titleLineEnd = text.indexOf('\n', cur.offset);
    const bodyStart =
      titleLineEnd >= 0 && titleLineEnd < end ? titleLineEnd + 1 : cur.offset + cur.title.length;
    const body = text.slice(bodyStart, end).trim();
    const paragraphs = segmentParagraphs(body);
    chapters.push(
      buildChapter({
        chapterNumber: 0,
        title: cur.title,
        startOffset: cur.offset,
        endOffset: end,
        body,
        confidence: cur.confidence,
        detectorIds: [cur.detectorId],
        paragraphs,
      }),
    );
  }

  // Assign stable sequential numbers (title-independent)
  const numbered = chapters.map((ch, idx) => ({
    ...ch,
    chapterNumber: idx + 1,
  }));

  markDuplicates(numbered);

  const overall =
    numbered.reduce((sum, ch) => sum + ch.confidence, 0) / Math.max(numbered.length, 1);

  return {
    chapters: numbered,
    overallConfidence: overall,
    warnings,
  };
}

/**
 * Apply manual split points (character offsets into normalized text).
 * Offsets must be sorted ascending; each starts a new chapter.
 */
export function applyManualSplits(
  rawText: string,
  splits: { offset: number; title?: string }[],
): ChapterDetectionResult {
  const text = normalizeNovelText(rawText);
  const sorted = [...splits].sort((a, b) => a.offset - b.offset);
  const warnings: string[] = [];
  if (sorted.length === 0) {
    return detectChapters(text);
  }

  const chapters: DetectedChapter[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const next = i + 1 < sorted.length ? sorted[i + 1] : undefined;
    const start = Math.max(0, Math.min(cur.offset, text.length));
    const end =
      next === undefined
        ? text.length
        : Math.max(start, Math.min(next.offset, text.length));
    const slice = text.slice(start, end);
    const firstNl = slice.indexOf('\n');
    const trimmedManual = cur.title?.trim();
    const title =
      trimmedManual && trimmedManual.length > 0
        ? trimmedManual
        : firstNl > 0
          ? slice.slice(0, firstNl).trim()
          : `第${i + 1}章`;
    const body =
      cur.title && firstNl >= 0
        ? slice.slice(firstNl + 1).trim()
        : firstNl >= 0 && !cur.title
          ? slice.slice(firstNl + 1).trim()
          : slice.trim();
    const paragraphs = segmentParagraphs(body);
    chapters.push(
      buildChapter({
        chapterNumber: i + 1,
        title,
        startOffset: start,
        endOffset: end,
        body,
        confidence: 1,
        detectorIds: ['manual'],
        paragraphs,
      }),
    );
  }

  markDuplicates(chapters);
  return {
    chapters,
    overallConfidence: 1,
    warnings,
  };
}

function mergeCandidates(
  candidates: ChapterBoundaryCandidate[],
): ChapterBoundaryCandidate[] {
  if (candidates.length === 0) return [];
  const byLine = new Map<number, ChapterBoundaryCandidate>();
  for (const c of candidates) {
    const existing = byLine.get(c.lineIndex);
    if (!existing || c.confidence > existing.confidence) {
      byLine.set(c.lineIndex, c);
    }
  }
  return [...byLine.values()].sort((a, b) => a.offset - b.offset);
}

function buildChapter(input: {
  chapterNumber: number;
  title: string;
  startOffset: number;
  endOffset: number;
  body: string;
  confidence: number;
  detectorIds: string[];
  paragraphs: SegmentedParagraph[];
}): DetectedChapter {
  const sourceHash = sha256Text(input.body);
  return {
    chapterNumber: input.chapterNumber,
    title: input.title,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    body: input.body,
    confidence: input.confidence,
    detectorIds: input.detectorIds,
    isDuplicateTitle: false,
    isDuplicateHash: false,
    sourceHash,
    characterCount: Array.from(input.body).length,
    paragraphCount: input.paragraphs.length,
    paragraphs: input.paragraphs,
  };
}

function markDuplicates(chapters: DetectedChapter[]): void {
  const titleCounts = new Map<string, number>();
  const hashCounts = new Map<string, number>();
  for (const ch of chapters) {
    const t = ch.title.trim();
    titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    hashCounts.set(ch.sourceHash, (hashCounts.get(ch.sourceHash) ?? 0) + 1);
  }
  for (const ch of chapters) {
    ch.isDuplicateTitle = (titleCounts.get(ch.title.trim()) ?? 0) > 1;
    ch.isDuplicateHash = (hashCounts.get(ch.sourceHash) ?? 0) > 1 && ch.body.length > 0;
  }
}
