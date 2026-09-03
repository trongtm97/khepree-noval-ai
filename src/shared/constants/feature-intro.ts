/** Local feature introduction / What's New (Prompt 18). */

export const FEATURE_INTRO_META_KEYS = {
  seenVersion: 'featureIntro.seenVersion',
  suppressAll: 'featureIntro.suppressAll',
  tourCompleted: 'featureIntro.tourCompleted',
  tourSkipped: 'featureIntro.tourSkipped',
} as const;

/** Bump when hero copy or mandatory feature set changes. */
export const CURRENT_FEATURE_INTRO_VERSION = '2026.09-production-v1';

export const FEATURE_TOUR_STEP_COUNT = 3;

export const FEATURE_INTRO_CTA_ROUTE = '/jobs';
