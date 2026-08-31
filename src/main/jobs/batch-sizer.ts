import {
  DEFAULT_MAX_CHAPTERS_PER_JOB,
} from '@shared/constants/job';
import { resolveProviderCharBudget as resolveCharBudgetFromCapabilities } from '@main/ai/provider-chunking-policy';
import type { RepairParagraph } from './repair-strategies';

export interface ChapterBatchInput {
  chapterId: string;
  chapterRef: number;
  batchParagraphs: RepairParagraph[];
}

export interface BatchSizerHistory {
  /** Output chars / source chars from recent successful jobs. */
  avgOutputRatio: number;
  /** Fraction of recent jobs that hit OUTPUT_INCOMPLETE (0–1). */
  recentIncompleteRate: number;
  /** Fraction of recent jobs that completed without attention (0–1). */
  recentSuccessRate: number;
}

export interface BatchSizeDecision {
  chapters: ChapterBatchInput[];
  userMaxChapters: number;
  chosenChapterCount: number;
  sourceCharacters: number;
  paragraphCount: number;
  reason: string;
}

export const DEFAULT_BATCH_SIZER_HISTORY: BatchSizerHistory = {
  avgOutputRatio: 1.25,
  recentIncompleteRate: 0,
  recentSuccessRate: 1,
};

export function computeSourceCharacters(paragraphs: RepairParagraph[]): number {
  return paragraphs.reduce((sum, p) => sum + p.sourceText.length, 0);
}

export function resolveProviderCharBudget(
  providerType: string | null | undefined,
  history: BatchSizerHistory = DEFAULT_BATCH_SIZER_HISTORY,
): { maxSourceChars: number; maxParagraphs: number } {
  return resolveCharBudgetFromCapabilities(providerType, history);
}

export function historyFromProjectStats(stats: {
  success_count: number;
  failure_count: number;
  incomplete_count: number;
  avg_output_ratio: number | null;
} | null): BatchSizerHistory {
  if (!stats) return { ...DEFAULT_BATCH_SIZER_HISTORY };
  const total = stats.success_count + stats.failure_count + stats.incomplete_count;
  if (total === 0) return { ...DEFAULT_BATCH_SIZER_HISTORY };
  return {
    avgOutputRatio: stats.avg_output_ratio ?? DEFAULT_BATCH_SIZER_HISTORY.avgOutputRatio,
    recentIncompleteRate: stats.incomplete_count / total,
    recentSuccessRate: stats.success_count / total,
  };
}

/**
 * Group consecutive chapters into adaptive translation jobs.
 * User maxChapters is an upper bound — engine may shrink when source is large.
 */
export function planChapterBatches(
  chapters: ChapterBatchInput[],
  options: {
    maxChaptersUser?: number;
    providerType?: string | null;
    history?: BatchSizerHistory;
  },
): BatchSizeDecision[] {
  if (chapters.length === 0) return [];

  const maxChaptersUser = options.maxChaptersUser ?? DEFAULT_MAX_CHAPTERS_PER_JOB;
  const history = options.history ?? DEFAULT_BATCH_SIZER_HISTORY;
  const { maxSourceChars, maxParagraphs } = resolveProviderCharBudget(
    options.providerType,
    history,
  );

  const decisions: BatchSizeDecision[] = [];
  let index = 0;

  while (index < chapters.length) {
    const batch: ChapterBatchInput[] = [];
    let charSum = 0;
    let paraSum = 0;

    while (index < chapters.length && batch.length < maxChaptersUser) {
      const chapter = chapters[index];
      const chChars = computeSourceCharacters(chapter.batchParagraphs);
      const chParas = chapter.batchParagraphs.length;

      const overflow =
        batch.length > 0 &&
        (charSum + chChars > maxSourceChars || paraSum + chParas > maxParagraphs);

      if (overflow) break;

      if (batch.length === 0 && chChars > maxSourceChars) {
        batch.push(chapter);
        index += 1;
        break;
      }

      batch.push(chapter);
      charSum += chChars;
      paraSum += chParas;
      index += 1;

      if (charSum >= Math.floor(maxSourceChars * 0.92)) break;
    }

    if (batch.length === 0) {
      batch.push(chapters[index]);
      index += 1;
    }

    const allParas = batch.flatMap((c) => c.batchParagraphs);
    const sourceCharacters = computeSourceCharacters(allParas);
    const paragraphCount = allParas.length;
    const chosenChapterCount = batch.length;

    let reason: string;
    if (chosenChapterCount < maxChaptersUser && chosenChapterCount < chapters.length) {
      reason =
        `Giảm từ tối đa ${maxChaptersUser} xuống ${chosenChapterCount} chương ` +
        `(${sourceCharacters.toLocaleString()} ký tự, ${paragraphCount} đoạn)`;
    } else if (sourceCharacters > maxSourceChars * 0.85) {
      reason = `Gần giới hạn ký tự (${sourceCharacters.toLocaleString()}/${maxSourceChars.toLocaleString()})`;
    } else {
      reason = `${chosenChapterCount} chương trong giới hạn`;
    }

    decisions.push({
      chapters: batch,
      userMaxChapters: maxChaptersUser,
      chosenChapterCount,
      sourceCharacters,
      paragraphCount,
      reason,
    });
  }

  return decisions;
}
