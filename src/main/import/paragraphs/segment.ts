import { normalizeNovelText } from './normalize';
import {
  SEGMENT_HARD_CHARS,
  SEGMENT_SOFT_CHARS,
} from '@shared/constants/segment';

export interface SegmentedParagraph {
  text: string;
  /** Newlines to emit after this paragraph on export (1 = adjacent, 2 = blank line). */
  trailingNewlines: number;
}

export interface SegmentParagraphsOptions {
  softChars?: number;
  hardChars?: number;
}

const SENTENCE_END_RE = /[。！？!?…]$/;

function endsSentence(line: string): boolean {
  return SENTENCE_END_RE.test(line.trim());
}

function clampTrailing(n: number): number {
  return Math.max(1, Math.min(2, Math.floor(n)));
}

/**
 * Merge single-newline lines into multi-sentence paragraphs.
 * Soft flush at softChars when line ends a sentence; hard flush at hardChars.
 */
function mergeDenseLines(
  lines: string[],
  softChars: number,
  hardChars: number,
): SegmentedParagraph[] {
  const out: SegmentedParagraph[] = [];
  let buf: string[] = [];

  const bufText = (): string => buf.join('\n');
  const bufLen = (): number => bufText().length;

  const flush = (trailingNewlines: number) => {
    if (buf.length === 0) return;
    out.push({ text: bufText(), trailingNewlines: clampTrailing(trailingNewlines) });
    buf = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const nextLen = bufLen() + (buf.length > 0 ? 1 : 0) + line.length;
    if (buf.length > 0 && nextLen > hardChars) {
      flush(1);
    }
    buf.push(line);
    const isLast = i === lines.length - 1;
    if (!isLast && bufLen() >= softChars && endsSentence(line)) {
      flush(1);
    }
  }
  flush(1);
  return out;
}

/**
 * Split chapter body into paragraphs.
 * Blank-line separated blocks preferred; dense single-newline text is merged into
 * multi-sentence paragraphs (not one paragraph per line).
 */
export function segmentParagraphs(
  chapterBody: string,
  options?: SegmentParagraphsOptions,
): SegmentedParagraph[] {
  const softChars = options?.softChars ?? SEGMENT_SOFT_CHARS;
  const hardChars = options?.hardChars ?? SEGMENT_HARD_CHARS;
  const normalized = normalizeNovelText(chapterBody);
  if (!normalized.trim()) {
    return [];
  }

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const paragraphs: SegmentedParagraph[] = [];

  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi];
    const isLastBlock = bi === blocks.length - 1;
    let parts: SegmentedParagraph[];

    if (block.includes('\n')) {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      parts = mergeDenseLines(lines, softChars, hardChars);
    } else {
      parts = [{ text: block, trailingNewlines: 2 }];
    }

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLastOverall = isLastBlock && i === parts.length - 1;
      const isLastInBlock = i === parts.length - 1;
      let trailing = part.trailingNewlines;
      if (isLastOverall) {
        trailing = 1;
      } else if (isLastInBlock) {
        // Blank-line gap between original blocks
        trailing = 2;
      }
      paragraphs.push({ text: part.text, trailingNewlines: clampTrailing(trailing) });
    }
  }

  return paragraphs;
}

/** Convenience: paragraph texts only (preview / counts). */
export function segmentParagraphTexts(
  chapterBody: string,
  options?: SegmentParagraphsOptions,
): string[] {
  return segmentParagraphs(chapterBody, options).map((p) => p.text);
}
