/** app_meta key for global default target language (new projects / editions). */
export const TRANSLATION_SETTINGS_META_KEYS = {
  defaultTargetLanguage: 'settings.default_target_language',
} as const;

/**
 * Fallback when setting is unset (legacy zh→vi installs).
 * Use only in settings service — never hardcode in Create Project UI.
 */
export const LEGACY_DEFAULT_TARGET_LANGUAGE = 'vi';

/** Pick initial target when adding a translation edition. */
export function resolveEditionDefaultTarget(params: {
  defaultTargetLanguage: string;
  sourceLanguage: string;
  existingTargets: readonly string[];
  addableCodes: readonly string[];
}): { suggestedTarget: string; duplicateDefault: boolean } {
  const existing = new Set(params.existingTargets);
  const duplicateDefault =
    existing.has(params.defaultTargetLanguage) ||
    params.defaultTargetLanguage === params.sourceLanguage;

  if (
    !duplicateDefault &&
    params.addableCodes.includes(params.defaultTargetLanguage)
  ) {
    return {
      suggestedTarget: params.defaultTargetLanguage,
      duplicateDefault: false,
    };
  }

  const first = params.addableCodes.find(
    (code) => code !== params.sourceLanguage && !existing.has(code),
  );
  return {
    suggestedTarget: first ?? '',
    duplicateDefault,
  };
}
