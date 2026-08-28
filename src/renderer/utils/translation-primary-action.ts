import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { isJobActive } from '@shared/utils/job-progress';
import { chapterRef } from '../components/translation/chapter-utils';
import {
  findNextUntranslatedIndex,
  translatingNumbersFromJob,
} from './chapter-navigator';
import { resolveChapterDisplayStatus } from '../features/project-chapters/chapter-display-status';

export type PrimaryTranslateLabelKey =
  | 'translation.continueAction'
  | 'translation.translateChapterN'
  | 'translation.continueNextChapter'
  | 'actions.resume'
  | 'dashboard.translationComplete'
  | 'translation.translatingAction';

export interface PrimaryTranslateActionState {
  labelKey: PrimaryTranslateLabelKey;
  labelParams?: Record<string, string>;
  disabled: boolean;
  loading: boolean;
  showPlayIcon: boolean;
  primaryHandler: 'continue' | 'resume' | 'none';
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
  activeJob: JobDto | null;
  preparing: boolean;
  busy: boolean;
}): PrimaryTranslateActionState {
  const { chapters, chapterIndex, nextUntranslatedChapter, activeJob, preparing, busy } = input;
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

  const current = chapters.at(chapterIndex);
  if (!current) {
    return {
      labelKey: 'translation.continueAction',
      disabled: busy || preparing || chapters.length === 0,
      loading: preparing || busy,
      showPlayIcon: true,
      primaryHandler: 'continue',
    };
  }

  const translatingNumbers = translatingNumbersFromJob(activeJob);
  const currentStatus = resolveChapterDisplayStatus(current, translatingNumbers);
  const currentNum = chapterRef(current);

  if (currentStatus === 'untranslated') {
    return {
      labelKey: 'translation.translateChapterN',
      labelParams: { n: String(currentNum) },
      disabled: busy || preparing,
      loading: preparing || busy,
      showPlayIcon: true,
      primaryHandler: 'continue',
    };
  }

  const nextIdx = findNextUntranslatedIndex(chapters, chapterIndex, translatingNumbers);
  if (nextIdx != null && nextIdx !== chapterIndex) {
    const nextNum = chapterRef(chapters[nextIdx]);
    if (nextNum !== currentNum) {
      return {
        labelKey: 'translation.continueNextChapter',
        labelParams: { n: String(nextNum) },
        disabled: busy || preparing,
        loading: preparing || busy,
        showPlayIcon: true,
        primaryHandler: 'continue',
      };
    }
  }

  if (nextUntranslatedChapter != null && nextUntranslatedChapter !== currentNum) {
    return {
      labelKey: 'translation.continueNextChapter',
      labelParams: { n: String(nextUntranslatedChapter) },
      disabled: busy || preparing,
      loading: preparing || busy,
      showPlayIcon: true,
      primaryHandler: 'continue',
    };
  }

  return {
    labelKey: 'translation.continueAction',
    disabled: busy || preparing,
    loading: preparing || busy,
    showPlayIcon: true,
    primaryHandler: 'continue',
  };
}
