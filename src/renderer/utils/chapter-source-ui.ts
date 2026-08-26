import type { ChapterSourceStatus } from '@shared/constants/source-folder';
import { CHAPTER_SOURCE_STATUS_LABELS } from '@shared/constants/source-folder';

export function chapterSourceIcon(sourceStatus?: string): string {
  switch (sourceStatus as ChapterSourceStatus | undefined) {
    case 'SOURCE_READY':
      return '●';
    case 'SOURCE_MODIFIED':
      return '⚠';
    case 'SOURCE_MISSING':
      return '⚠';
    case 'SOURCE_CONFLICT':
      return '⚡';
    case 'SOURCE_ERROR':
      return '✕';
    case 'NO_SOURCE':
      return '○';
    default:
      return '○';
  }
}

export function chapterSourceTooltip(sourceStatus?: string): string {
  if (!sourceStatus) return '';
  const key = sourceStatus as ChapterSourceStatus;
  if (key in CHAPTER_SOURCE_STATUS_LABELS) {
    return CHAPTER_SOURCE_STATUS_LABELS[key];
  }
  return sourceStatus;
}
