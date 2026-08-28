import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';

export function chapterRef(ch: ChapterSummaryDto): number {
  return ch.chapterNumber ?? ch.sequenceOrder;
}

export function chapterLabel(ch: ChapterSummaryDto): string {
  if (ch.displayTitle) return ch.displayTitle;
  if (ch.chapterNumber != null) return String(ch.chapterNumber);
  return ch.title ?? String(ch.sequenceOrder);
}

/** Rail row label: "Chương 3" or "Chương 16 · Hồi sinh" — never bare "3 · Chương". */
export function formatChapterDisplayLabel(
  ch: ChapterSummaryDto,
  chapterPrefix: string,
): string {
  const num = chapterRef(ch);
  const base = chapterPrefix.replace('{n}', String(num));
  const title = ch.title?.trim();
  if (title && !title.toLowerCase().startsWith('chương')) {
    return `${base} · ${title}`;
  }
  if (ch.displayTitle?.trim() && ch.displayTitle !== base) {
    return `${base} · ${ch.displayTitle.trim()}`;
  }
  return base;
}
