/** How the user indicated source language at create time. */
export const SOURCE_LANGUAGE_MODES = ['AUTO', 'HINTED'] as const;
export type SourceLanguageMode = (typeof SOURCE_LANGUAGE_MODES)[number];

/** Detection pipeline method stored on project. */
export const SOURCE_DETECTION_METHODS = ['LOCAL', 'AI', 'HYBRID', 'FALLBACK'] as const;
export type SourceDetectionMethod = (typeof SOURCE_DETECTION_METHODS)[number];

export const SOURCE_DETECTION_LOG_EVENTS = {
  started: 'LANGUAGE_DETECTION_STARTED',
  local: 'LANGUAGE_DETECTION_LOCAL',
  ai: 'LANGUAGE_DETECTION_AI',
  detected: 'LANGUAGE_DETECTED',
  hintMismatch: 'LANGUAGE_HINT_MISMATCH',
  redetected: 'LANGUAGE_REDETECTED',
} as const;

/** Target sample size for language detection (characters). */
export const LANGUAGE_SAMPLE_MIN_CHARS = 3_000;
export const LANGUAGE_SAMPLE_MAX_CHARS = 10_000;
