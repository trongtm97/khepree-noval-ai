import { app } from 'electron';
import { SETUP_META_KEYS } from '@shared/constants/setup';
import {
  LEGACY_UI_LANGUAGE_META_KEYS,
  UI_LANGUAGE_DEFAULT_PREFERENCE,
  UI_LANGUAGE_META_KEYS,
} from '@shared/constants/ui-language';
import {
  normalizeUiLocalePreference,
  resolveUiLocale,
  type UiLocaleCode,
  type UiLocalePreference,
} from '@shared/types/ui-locale';
import type { UiLanguageStatus } from '@shared/schemas/ui-language';
import type { DatabaseManager } from '../db/database-manager';

function resolveOsUiLocale(): UiLocaleCode {
  const raw = app.getLocale?.() ?? 'vi';
  const base = raw.split('-')[0]?.toLowerCase();
  return base === 'en' ? 'en' : 'vi';
}

function readPreferenceRaw(db: DatabaseManager): string | null {
  return (
    db.appMeta.get(UI_LANGUAGE_META_KEYS.preference) ??
    db.appMeta.get(LEGACY_UI_LANGUAGE_META_KEYS.khepreeLocale)
  );
}

function readChosenRaw(db: DatabaseManager): string | null {
  return (
    db.appMeta.get(UI_LANGUAGE_META_KEYS.chosen) ??
    db.appMeta.get(LEGACY_UI_LANGUAGE_META_KEYS.khepreeChosen)
  );
}

function isExistingInstall(db: DatabaseManager): boolean {
  if (db.appMeta.get(SETUP_META_KEYS.completed) === '1') return true;
  if (db.appMeta.get(SETUP_META_KEYS.explored) === '1') return true;
  if (db.projects.list().length > 0) return true;
  if (readChosenRaw(db) === '1') return true;
  return false;
}

function persistPreference(db: DatabaseManager, preference: UiLocalePreference): void {
  db.appMeta.set(UI_LANGUAGE_META_KEYS.preference, preference);
  db.appMeta.set(UI_LANGUAGE_META_KEYS.chosen, '1');
  db.appMeta.delete(LEGACY_UI_LANGUAGE_META_KEYS.khepreeLocale);
  db.appMeta.delete(LEGACY_UI_LANGUAGE_META_KEYS.khepreeChosen);
}

function buildStatus(db: DatabaseManager): UiLanguageStatus {
  migrateLegacyIfNeeded(db);

  const chosenRaw = readChosenRaw(db);
  const chosen = chosenRaw === '1';

  if (!chosen && isExistingInstall(db)) {
    const osLocale = resolveOsUiLocale();
    persistPreference(db, osLocale);
    return {
      preference: osLocale,
      locale: osLocale,
      chosen: true,
      needsFirstRunChooser: false,
    };
  }

  if (!chosen) {
    return {
      preference: UI_LANGUAGE_DEFAULT_PREFERENCE,
      locale: UI_LANGUAGE_DEFAULT_PREFERENCE,
      chosen: false,
      needsFirstRunChooser: true,
    };
  }

  const preference = normalizeUiLocalePreference(readPreferenceRaw(db));
  const locale = resolveUiLocale(preference, resolveOsUiLocale());

  if (readPreferenceRaw(db) !== preference) {
    db.appMeta.set(UI_LANGUAGE_META_KEYS.preference, preference);
  }

  return {
    preference,
    locale,
    chosen: true,
    needsFirstRunChooser: false,
  };
}

function migrateLegacyIfNeeded(db: DatabaseManager): void {
  const hasNew = db.appMeta.get(UI_LANGUAGE_META_KEYS.preference) != null;
  if (hasNew) return;

  const legacyPref = db.appMeta.get(LEGACY_UI_LANGUAGE_META_KEYS.khepreeLocale);
  const legacyChosen = db.appMeta.get(LEGACY_UI_LANGUAGE_META_KEYS.khepreeChosen);
  if (legacyPref == null && legacyChosen == null) return;

  if (legacyPref === 'vi' || legacyPref === 'en') {
    db.appMeta.set(UI_LANGUAGE_META_KEYS.preference, legacyPref);
  }
  if (legacyChosen === '1') {
    db.appMeta.set(UI_LANGUAGE_META_KEYS.chosen, '1');
  }
}

export class UiLanguageService {
  constructor(private readonly getDb: () => DatabaseManager) {}

  getStatus(): UiLanguageStatus {
    return buildStatus(this.getDb());
  }

  setPreference(preference: UiLocalePreference): UiLanguageStatus {
    const normalized = normalizeUiLocalePreference(preference);
    persistPreference(this.getDb(), normalized);
    return buildStatus(this.getDb());
  }

  completeFirstRun(preference: UiLocaleCode): UiLanguageStatus {
    persistPreference(this.getDb(), preference);
    return buildStatus(this.getDb());
  }
}
