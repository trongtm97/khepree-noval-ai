/** Import paragraph segmentation (blank-line + dense line merge). */

/** Soft target: flush dense buffer when at/above this and line ends a sentence. */
export const SEGMENT_SOFT_CHARS = 500;

/** Hard cap: force flush before exceeding this length. */
export const SEGMENT_HARD_CHARS = 1200;
