import {
  LEGACY_DEFAULT_TARGET_LANGUAGE,
  TRANSLATION_SETTINGS_META_KEYS,
} from '@shared/constants/translation-settings';
import {
  getLanguageProfile,
  hasLanguageProfile,
  normalizeLanguageCode,
} from '@shared/constants/language-profile';
import type { DefaultTargetLanguageSettings } from '@shared/schemas/translation-settings';
import type { DatabaseManager } from '../db/database-manager';

export function readDefaultTargetLanguage(
  db: DatabaseManager,
): DefaultTargetLanguageSettings {
  const raw = db.appMeta.get(TRANSLATION_SETTINGS_META_KEYS.defaultTargetLanguage);
  if (raw == null || raw.trim() === '') {
    return {
      defaultTargetLanguage: LEGACY_DEFAULT_TARGET_LANGUAGE,
      hadPersistedValue: false,
    };
  }

  const normalized = normalizeLanguageCode(raw);
  if (!hasLanguageProfile(normalized)) {
    return {
      defaultTargetLanguage: LEGACY_DEFAULT_TARGET_LANGUAGE,
      invalidPersisted: true,
      hadPersistedValue: true,
    };
  }

  const profile = getLanguageProfile(normalized);
  return {
    defaultTargetLanguage: normalized,
    hadPersistedValue: true,
    experimental: profile.providerSupport === 'CATALOG_ONLY',
  };
}

export function setDefaultTargetLanguage(
  db: DatabaseManager,
  code: string,
): DefaultTargetLanguageSettings {
  const normalized = normalizeLanguageCode(code);
  if (!hasLanguageProfile(normalized)) {
    throw new Error('INVALID_LANGUAGE_CODE');
  }
  db.appMeta.set(TRANSLATION_SETTINGS_META_KEYS.defaultTargetLanguage, normalized);
  return readDefaultTargetLanguage(db);
}
