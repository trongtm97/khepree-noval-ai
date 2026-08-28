import { TranslationLanguagePairMissingError } from '@shared/constants/translation-language';
import { normalizeLanguageCode } from '@shared/constants/language-profile';

export function requireRepairLanguagePair(input: {
  sourceLanguage?: string;
  targetLanguage?: string;
}): { sourceLanguage: string; targetLanguage: string } {
  const source = input.sourceLanguage?.trim();
  const target = input.targetLanguage?.trim();
  if (!source || !target) {
    throw new TranslationLanguagePairMissingError();
  }
  return {
    sourceLanguage: normalizeLanguageCode(source),
    targetLanguage: normalizeLanguageCode(target),
  };
}
