import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { isJobActive } from '@shared/utils/job-progress';
import { chapterRef } from '../components/translation/chapter-utils';

export type PrimaryTranslateLabelKey =
  | 'translation.translateChapterN'
  | 'translation.translateSelectedMenu'
  | 'translation.translateCurrent'
  | 'actions.resume'
  | 'dashboard.translationComplete'
  | 'translation.translatingAction';

export interface PrimaryTranslateActionState {
  labelKey: PrimaryTranslateLabelKey;
  labelParams?: Record<string, string>;
  disabled: boolean;
  loading: boolean;
  showPlayIcon: boolean;
  primaryHandler: 'translateCurrent' | 'translateSelected' | 'resume' | 'none';
}

function projectFullyTranslated(
  chapters: ChapterSummaryDto[],
  nextUntranslatedChapter: number | null | undefined,
): boolean {
  if (chapters.length === 0) return false;
  if (nextUntranslatedChapter != null) return false;
  return chapters.every((ch) => ch.hasTranslation);
}

export function resolvePrimaryTranslateAction(input: {
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  nextUntranslatedChapter?: number | null;
  selectedCount?: number;
  activeJob: JobDto | null;
  preparing: boolean;
  busy: boolean;
}): PrimaryTranslateActionState {
  const {
    chapters,
    chapterIndex,
    nextUntranslatedChapter,
    selectedCount = 0,
    activeJob,
    preparing,
    busy,
  } = input;
  const jobActive = activeJob != null && isJobActive(activeJob.state);
  const jobPaused = activeJob?.state === 'PAUSED';
  const jobRunning = jobActive && !jobPaused;

  if (projectFullyTranslated(chapters, nextUntranslatedChapter)) {
    return {
      labelKey: 'dashboard.translationComplete',
      disabled: true,
      loading: false,
      showPlayIcon: false,
      primaryHandler: 'none',
    };
  }

  if (jobRunning) {
    return {
      labelKey: 'translation.translatingAction',
      disabled: true,
      loading: true,
      showPlayIcon: false,
      primaryHandler: 'none',
    };
  }

  if (jobPaused) {
    return {
      labelKey: 'actions.resume',
      disabled: busy || preparing,
      loading: preparing,
      showPlayIcon: true,
      primaryHandler: 'resume',
    };
  }

  if (selectedCount > 0) {
    return {
      labelKey: 'translation.translateSelectedMenu',
      labelParams: { count: String(selectedCount) },
      disabled: busy || preparing,
      loading: preparing || busy,
      showPlayIcon: true,
      primaryHandler: 'translateSelected',
    };
  }

  const current = chapters.at(chapterIndex);
  if (!current) {
    return {
      labelKey: 'translation.translateCurrent',
      disabled: busy || preparing || chapters.length === 0,
      loading: preparing || busy,
      showPlayIcon: true,
      primaryHandler: 'translateCurrent',
    };
  }

  const currentNum = chapterRef(current);
  return {
    labelKey: 'translation.translateChapterN',
    labelParams: { n: String(currentNum) },
    disabled: busy || preparing,
    loading: preparing || busy,
    showPlayIcon: true,
    primaryHandler: 'translateCurrent',
  };
}
