/**
 * Canonical source language for translation engine.
 * Re-exports production resolver — hint is never used.
 */
export {
  projectSourceLanguageProfile,
  resolveForProjectEdition,
  resolveLanguagePairFromRows,
  resolveProjectSourceLanguage,
  resolveProjectSourceLanguageForProduction,
  type ResolvedTranslationLanguagePair,
  type ResolveForProjectEditionInput,
} from './translation-language-resolver';
