import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveAppPaths } from '@main/services/paths-service';
import {
  closeDatabase,
  createDatabaseManager,
  type DatabaseManager,
} from '@main/db/connection';
import {
  FeatureIntroService,
  resetFeatureIntroServiceForTests,
} from '@main/services/feature-intro-service';
import {
  CURRENT_FEATURE_INTRO_VERSION,
  FEATURE_INTRO_CTA_ROUTE,
  FEATURE_INTRO_META_KEYS,
} from '@shared/constants/feature-intro';
import { en } from '../../../src/renderer/i18n/locales/en/index';
import { vi } from '../../../src/renderer/i18n/locales/vi/index';

describe('feature intro service', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let service: FeatureIntroService;

  beforeEach(() => {
    resetFeatureIntroServiceForTests();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-feature-intro-'));
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.data, { recursive: true });
    fs.mkdirSync(paths.backups, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    service = new FeatureIntroService(db);
  });

  afterEach(() => {
    resetFeatureIntroServiceForTests();
    closeDatabase();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Windows may keep db handle briefly after close
    }
  });

  it('shows whats new once per intro version', () => {
    expect(service.getState().shouldShowWhatsNew).toBe(true);
    service.dismissWhatsNew('close');
    expect(service.getState().shouldShowWhatsNew).toBe(false);
    expect(db.appMeta.get(FEATURE_INTRO_META_KEYS.seenVersion)).toBe(
      CURRENT_FEATURE_INTRO_VERSION,
    );
  });

  it('never show persists suppress flag', () => {
    service.dismissWhatsNew('never');
    const state = service.getState();
    expect(state.shouldShowWhatsNew).toBe(false);
    expect(state.suppressAll).toBe(true);
    expect(db.appMeta.get(FEATURE_INTRO_META_KEYS.suppressAll)).toBe('1');
  });

  it('resets tour from help restart', () => {
    service.updateTour({ skipped: true });
    expect(service.getState().tourSkipped).toBe(true);
    service.updateTour({ reset: true });
    const state = service.getState();
    expect(state.tourSkipped).toBe(false);
    expect(state.tourCompleted).toBe(false);
  });

  it('marks tour completed and clears skipped', () => {
    service.updateTour({ skipped: true });
    service.updateTour({ completed: true });
    const state = service.getState();
    expect(state.tourCompleted).toBe(true);
    expect(state.tourSkipped).toBe(false);
    expect(db.appMeta.get(FEATURE_INTRO_META_KEYS.tourCompleted)).toBe('1');
  });

  it('CTA route targets production center', () => {
    expect(FEATURE_INTRO_CTA_ROUTE).toBe('/jobs');
  });
});

describe('feature intro i18n', () => {
  const keys = [
    'whatsNew.title',
    'whatsNew.body',
    'whatsNew.cta',
    'whatsNew.neverShow',
    'whatsNew.costNote',
    'featureTour.skip',
    'featureTour.finish',
    'featureTour.steps.batchImport.title',
    'featureTour.steps.recipeMode.body',
    'featureTour.steps.productionCenter.title',
    'help.restartProductionTour',
  ] as const;

  function pick(obj: Record<string, unknown>, dotted: string): unknown {
    return dotted.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, obj);
  }

  it('has EN and VI strings for modal and tour', () => {
    for (const key of keys) {
      expect(pick(en as Record<string, unknown>, key), `${key} en`).toBeTruthy();
      expect(pick(vi as Record<string, unknown>, key), `${key} vi`).toBeTruthy();
    }
  });

  it('uses required hero copy in VI and EN', () => {
    expect(vi.whatsNew.title).toBe('Mới: Dịch nhiều truyện trong một chiến dịch');
    expect(vi.whatsNew.cta).toBe('Mở Trung tâm sản xuất');
    expect(en.whatsNew.title).toBe('New: Translate multiple novels in one campaign');
    expect(en.whatsNew.cta).toBe('Open Production Center');
  });
});
