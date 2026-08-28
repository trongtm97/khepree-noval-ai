import type { EditorParagraphDto } from '@shared/schemas/translation-editor';

export function paragraphNeedsQa(paragraph: EditorParagraphDto): boolean {
  return paragraph.status === 'qa_warning' || paragraph.qaWarnings.length > 0;
}

export function countQaParagraphs(paragraphs: EditorParagraphDto[]): number {
  return paragraphs.filter(paragraphNeedsQa).length;
}

export function qaParagraphIndices(paragraphs: EditorParagraphDto[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    if (paragraphNeedsQa(paragraphs[i])) out.push(i);
  }
  return out;
}

export function findNextQaParagraphIndex(
  paragraphs: EditorParagraphDto[],
  fromIndex: number,
): number | null {
  const indices = qaParagraphIndices(paragraphs);
  if (indices.length === 0) return null;
  const pos = indices.findIndex((i) => i > fromIndex);
  return pos >= 0 ? indices[pos] : indices[0];
}

/** Index of paragraph used as chapter title row, or -1. */
export function resolveTitleParagraphIndex(
  paragraphs: EditorParagraphDto[],
  chapterTitle: string | null | undefined,
): number {
  if (paragraphs.length === 0) return -1;
  const normalized = chapterTitle?.trim();
  if (normalized) {
    const idx = paragraphs.findIndex((p) => p.sourceText.trim() === normalized);
    if (idx >= 0) return idx;
    return 0;
  }
  const first = paragraphs[0];
  if (first.sourceText.length <= 120 && paragraphs.length > 1) return 0;
  return -1;
}

export function filterParagraphsForDisplay(
  paragraphs: EditorParagraphDto[],
  options: { qaOnly: boolean; titleIndex: number },
): EditorParagraphDto[] {
  let list = paragraphs;
  if (options.titleIndex >= 0) {
    list = list.filter((_, idx) => idx !== options.titleIndex);
  }
  if (options.qaOnly) {
    list = list.filter(paragraphNeedsQa);
  }
  return list;
}

export function splitRatioToSourceFr(ratio: number): number {
  const clamped = Math.min(0.65, Math.max(0.35, ratio));
  return clamped / (1 - clamped);
}

export function resolveParagraphDraftText(
  paragraph: EditorParagraphDto,
  dirty: Record<string, string>,
): string {
  return Object.hasOwn(dirty, paragraph.stableParagraphId)
    ? dirty[paragraph.stableParagraphId]
    : paragraph.translatedText ?? '';
}

export function isChapterFullyTranslated(
  paragraphs: EditorParagraphDto[],
  dirty: Record<string, string>,
): boolean {
  if (paragraphs.length === 0) return false;
  return paragraphs.every((paragraph) => {
    if (paragraph.humanLocked) return true;
    const text = resolveParagraphDraftText(paragraph, dirty).trim();
    return text.length > 0;
  });
}
