import type { DatabaseManager } from '../db/database-manager';
import {
  CURRENT_FEATURE_INTRO_VERSION,
  FEATURE_INTRO_META_KEYS,
} from '@shared/constants/feature-intro';
import type { FeatureIntroStateDto } from '@shared/schemas/feature-intro';

export class FeatureIntroService {
  constructor(private readonly db: DatabaseManager) {}

  getState(): FeatureIntroStateDto {
    const meta = this.db.appMeta;
    const seenVersion = meta.get(FEATURE_INTRO_META_KEYS.seenVersion);
    const suppressAll = meta.get(FEATURE_INTRO_META_KEYS.suppressAll) === '1';
    const tourCompleted = meta.get(FEATURE_INTRO_META_KEYS.tourCompleted) === '1';
    const tourSkipped = meta.get(FEATURE_INTRO_META_KEYS.tourSkipped) === '1';

    const shouldShowWhatsNew =
      !suppressAll && seenVersion !== CURRENT_FEATURE_INTRO_VERSION;

    return {
      introVersion: CURRENT_FEATURE_INTRO_VERSION,
      shouldShowWhatsNew,
      tourCompleted,
      tourSkipped,
      suppressAll,
    };
  }

  dismissWhatsNew(mode: 'close' | 'never'): FeatureIntroStateDto {
    const meta = this.db.appMeta;
    meta.set(FEATURE_INTRO_META_KEYS.seenVersion, CURRENT_FEATURE_INTRO_VERSION);
    if (mode === 'never') {
      meta.set(FEATURE_INTRO_META_KEYS.suppressAll, '1');
    }
    return this.getState();
  }

  updateTour(input: {
    completed?: boolean;
    skipped?: boolean;
    reset?: boolean;
  }): FeatureIntroStateDto {
    const meta = this.db.appMeta;
    if (input.reset) {
      meta.delete(FEATURE_INTRO_META_KEYS.tourCompleted);
      meta.delete(FEATURE_INTRO_META_KEYS.tourSkipped);
      return this.getState();
    }
    if (input.completed) {
      meta.set(FEATURE_INTRO_META_KEYS.tourCompleted, '1');
      meta.delete(FEATURE_INTRO_META_KEYS.tourSkipped);
    }
    if (input.skipped) {
      meta.set(FEATURE_INTRO_META_KEYS.tourSkipped, '1');
    }
    return this.getState();
  }

  shouldOfferTour(): boolean {
    const state = this.getState();
    return !state.tourCompleted && !state.tourSkipped;
  }
}

let singleton: FeatureIntroService | null = null;

export function getFeatureIntroService(db: DatabaseManager): FeatureIntroService {
  singleton ??= new FeatureIntroService(db);
  return singleton;
}

export function resetFeatureIntroServiceForTests(): void {
  singleton = null;
}
