import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { ChapterSourceStatus } from '@shared/constants/source-folder';

export type ChapterDisplayStatus =
  | 'untranslated'
  | 'translated'
  | 'translating'
  | 'source_changed'
  | 'needs_attention';

const ATTENTION_SOURCE: ChapterSourceStatus[] = [
  'SOURCE_CONFLICT',
  'SOURCE_ERROR',
  'SOURCE_MISSING',
];

export function resolveChapterDisplayStatus(
  chapter: ChapterSummaryDto,
  translatingNumbers: ReadonlySet<number>,
): ChapterDisplayStatus {
  const source = chapter.sourceStatus as ChapterSourceStatus | undefined;
  const num = chapter.chapterNumber;

  if (source && ATTENTION_SOURCE.includes(source)) {
    return 'needs_attention';
  }
  if (chapter.status === 'needs_retranslation' || source === 'SOURCE_MODIFIED') {
    return 'source_changed';
  }
  if (num != null && translatingNumbers.has(num)) {
    return 'translating';
  }
  if (chapter.hasTranslation) {
    return 'translated';
  }
  return 'untranslated';
}

export function sourceStatusLabelKey(sourceStatus?: string): string {
  switch (sourceStatus as ChapterSourceStatus | undefined) {
    case 'SOURCE_READY':
      return 'chaptersPage.sourceReady';
    case 'SOURCE_MODIFIED':
      return 'chaptersPage.sourceModified';
    case 'SOURCE_MISSING':
      return 'chaptersPage.sourceMissing';
    case 'SOURCE_CONFLICT':
      return 'chaptersPage.sourceConflict';
    case 'SOURCE_ERROR':
      return 'chaptersPage.sourceError';
    case 'NO_SOURCE':
      return 'chaptersPage.sourceNone';
    default:
      return 'chaptersPage.sourceNone';
  }
}
