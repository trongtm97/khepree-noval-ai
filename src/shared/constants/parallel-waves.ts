/** Parallel Translation Waves — experimental same-project parallel + commit barrier. */

export const PARALLEL_WAVES_FEATURE_KEY = 'experimental.parallel_translation_waves';

/** Default OFF — must be explicitly enabled. */
export const PARALLEL_WAVES_DEFAULT_ENABLED = false;

export const WAVE_STATUSES = [
  'RUNNING',
  'COMMITTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type WaveStatus = (typeof WAVE_STATUSES)[number];

export const WAVE_RESULT_STATUSES = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
] as const;
export type WaveResultStatus = (typeof WAVE_RESULT_STATUSES)[number];

export const WAVE_COMMIT_STATUSES = [
  'PENDING',
  'PROVISIONAL',
  'COMMITTED',
  'CONFLICT_REPAIR',
  'RETRANSLATE',
  'SKIPPED',
] as const;
export type WaveCommitStatus = (typeof WAVE_COMMIT_STATUSES)[number];

export type WaveConflictSeverity = 'none' | 'soft' | 'hard';

export const WAVE_CONFLICT_KINDS = [
  'locked_term',
  'name_correction',
  'relationship_address',
  'character_identity',
  'story_state',
] as const;
export type WaveConflictKind = (typeof WAVE_CONFLICT_KINDS)[number];

/** UI warning when enabling the experimental feature. */
export const PARALLEL_WAVES_UI_WARNING_VI =
  'Dịch song song cùng một truyện có thể cần kiểm tra lại một số chương để giữ tính nhất quán.';

export const PARALLEL_WAVES_UI_WARNING_EN =
  'Parallel translation of the same novel may require reviewing some chapters to keep consistency.';
