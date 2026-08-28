import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { isJobActive } from '@shared/utils/job-progress';
import {
  resolveChapterDisplayStatus,
  type ChapterDisplayStatus,
} from '../features/project-chapters/chapter-display-status';
import { chapterLabel, chapterRef } from '../components/translation/chapter-utils';

export const CHAPTER_NAV_ROW_HEIGHT = 36;
export const CHAPTER_NAV_OVERSCAN = 8;

export const CHAPTER_NAV_FILTERS = [
  'all',
  'untranslated',
  'translated',
  'translating',
  'needs_attention',
  'source_changed',
] as const;

export type ChapterNavFilter = (typeof CHAPTER_NAV_FILTERS)[number];

export const EMPTY_TRANSLATING: ReadonlySet<number> = new Set();

export interface ChapterNavEntry {
  ch: ChapterSummaryDto;
  idx: number;
  status: ChapterDisplayStatus;
}

export const CHAPTER_STATUS_GLYPH: Record<ChapterDisplayStatus, string> = {
  untranslated: '○',
  translated: '✓',
  translating: '●',
  needs_attention: '!',
  source_changed: '↻',
};

export const CHAPTER_STATUS_TOOLTIP_KEY: Record<ChapterDisplayStatus, string> = {
  untranslated: 'translation.chapterStatusUntranslated',
  translated: 'translation.chapterStatusTranslated',
  translating: 'translation.chapterStatusTranslating',
  needs_attention: 'translation.chapterStatusNeedsReview',
  source_changed: 'translation.chapterStatusSourceChanged',
};

export const CHAPTER_FILTER_LABEL_KEY: Record<ChapterNavFilter, string> = {
  all: 'translation.chapterFilterAll',
  untranslated: 'translation.chapterFilterUntranslated',
  translated: 'translation.chapterFilterTranslated',
  translating: 'translation.chapterFilterTranslating',
  needs_attention: 'translation.chapterFilterNeedsReview',
  source_changed: 'translation.chapterFilterSourceChanged',
};

export function translatingNumbersFromJob(job: JobDto | null): ReadonlySet<number> {
  if (!job || !isJobActive(job.state)) return EMPTY_TRANSLATING;
  const from = job.chapterFrom;
  const to = job.chapterTo ?? from;
  if (from == null || to == null) return EMPTY_TRANSLATING;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const set = new Set<number>();
  for (let n = lo; n <= hi; n += 1) set.add(n);
  return set;
}

export function chapterMatchesSearch(chapter: ChapterSummaryDto, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const label = chapterLabel(chapter).toLowerCase();
  if (label.includes(q)) return true;
  if (chapter.title?.toLowerCase().includes(q)) return true;
  if (chapter.displayTitle?.toLowerCase().includes(q)) return true;
  const num = chapter.chapterNumber;
  if (num != null && String(num).includes(q)) return true;
  return false;
}

export function filterChapterEntries(
  chapters: ChapterSummaryDto[],
  query: string,
  statusFilter: ChapterNavFilter,
  translatingNumbers: ReadonlySet<number>,
): ChapterNavEntry[] {
  const out: ChapterNavEntry[] = [];
  for (let idx = 0; idx < chapters.length; idx += 1) {
    const ch = chapters[idx];
    if (!chapterMatchesSearch(ch, query)) continue;
    const status = resolveChapterDisplayStatus(ch, translatingNumbers);
    if (statusFilter !== 'all' && status !== statusFilter) continue;
    out.push({ ch, idx, status });
  }
  return out;
}

export function findNextMatchingIndex(
  chapters: ChapterSummaryDto[],
  fromIndex: number,
  predicate: (chapter: ChapterSummaryDto, index: number) => boolean,
): number | null {
  const n = chapters.length;
  if (n === 0) return null;
  const start = Math.max(0, Math.min(fromIndex, n - 1));
  for (let step = 1; step < n; step += 1) {
    const idx = (start + step) % n;
    if (predicate(chapters[idx], idx)) return idx;
  }
  return null;
}

export function findNextUntranslatedIndex(
  chapters: ChapterSummaryDto[],
  fromIndex: number,
  translatingNumbers: ReadonlySet<number>,
): number | null {
  return findNextMatchingIndex(
    chapters,
    fromIndex,
    (ch) => resolveChapterDisplayStatus(ch, translatingNumbers) === 'untranslated',
  );
}

export function findNextIssueIndex(
  chapters: ChapterSummaryDto[],
  fromIndex: number,
  translatingNumbers: ReadonlySet<number>,
): number | null {
  return findNextMatchingIndex(chapters, fromIndex, (ch) => {
    const status = resolveChapterDisplayStatus(ch, translatingNumbers);
    return status === 'needs_attention' || status === 'source_changed';
  });
}

export function currentChapterCountLabel(
  chapters: ChapterSummaryDto[],
  chapterIndex: number,
): { current: string; total: string } {
  const current = chapters.at(chapterIndex);
  const n = current ? chapterRef(current) : chapterIndex + 1;
  return { current: String(n), total: String(chapters.length) };
}
