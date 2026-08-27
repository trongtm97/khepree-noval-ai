import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';

export function chapterRef(ch: ChapterSummaryDto): number {
  return ch.chapterNumber ?? ch.sequenceOrder;
}

export function chapterLabel(ch: ChapterSummaryDto): string {
  if (ch.displayTitle) return ch.displayTitle;
  if (ch.chapterNumber != null) return String(ch.chapterNumber);
  return ch.title ?? String(ch.sequenceOrder);
}
