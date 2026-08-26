/** Learning pipeline constants (Phase 16). */

/** Default chapters between Drive consolidate+sync (overridable per project). */
export const DEFAULT_LEARNING_SYNC_EVERY_N = 10;

/** Keep memory_events newer than (currentChapter - window). */
export const DEFAULT_MEMORY_ARCHIVE_CHAPTER_WINDOW = 20;

/** Soft cap: archive when active memory_events exceed this. */
export const DEFAULT_MEMORY_EVENT_SOFT_CAP = 200;

/** Max story summary chars before archival trim. */
export const DEFAULT_STORY_SUMMARY_MAX_CHARS = 4_000;

/** Confidence adjustments (0–1). AI never sets GLOBAL_VERIFIED. */
export const CONFIDENCE_DELTA = {
  /** Per repeated occurrence (capped). */
  occurrence: 0.04,
  occurrenceCap: 0.4,
  /** Per distinct project confirmation. */
  projectConfirm: 0.05,
  projectConfirmCap: 0.25,
  /** Human / AI-confirm toward PROJECT (not GLOBAL). */
  humanConfirm: 0.15,
  /** Floor/ceiling for AI-driven confidence. */
  aiFloor: 0.1,
  aiCeiling: 0.85,
  /** Ceiling when PROJECT_VERIFIED. */
  projectVerifiedCeiling: 0.99,
} as const;

export const TERM_DELTA_CONFIDENCE_MAP = {
  low: 0.25,
  medium: 0.45,
  high: 0.65,
} as const;

/** Pending candidates at/above this confidence enter translation packs. */
export const PACK_CANDIDATE_MIN_CONFIDENCE = TERM_DELTA_CONFIDENCE_MAP.medium;

export const LEARNING_EVENT_TYPES = [
  'term_candidate',
  'term_merge',
  'term_confirm',
  'term_occurrence',
  'memory_applied',
  'memory_conflict',
  'memory_archive',
  'consolidate',
  'drive_sync',
  'promotion',
] as const;

export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];
