import {
  BOOTSTRAP_CHAPTER_COUNT_MAX,
  DEFAULT_BOOTSTRAP_CHARACTER_BUDGET,
} from '@shared/constants/bootstrap';

export const AUTO_PREPROCESS_STEPS = [
  'deciding',
  'packing',
  'ensuring_notebook',
  'uploading',
  'analyzing',
  'importing',
  'syncing',
  'done',
  'failed',
] as const;

export type AutoPreprocessStep = (typeof AUTO_PREPROCESS_STEPS)[number];

/** Quick path: ≤20 chapters AND ≤80k source chars. */
export function decidePreprocessMode(input: {
  chapterCount: number;
  totalChars: number;
  forceFull?: boolean;
}): 'quick' | 'full' {
  if (input.forceFull) return 'full';
  if (
    input.chapterCount <= BOOTSTRAP_CHAPTER_COUNT_MAX &&
    input.totalChars <= DEFAULT_BOOTSTRAP_CHARACTER_BUDGET
  ) {
    return 'quick';
  }
  return 'full';
}
