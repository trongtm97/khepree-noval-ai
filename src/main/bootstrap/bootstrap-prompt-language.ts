import {
  formatAiLanguageIdentity,
  formatTargetScriptMetadataLines,
  getLanguageProfile,
} from '@shared/constants/language-profile';

/** Source / target edition labels for bootstrap prompts (no locale-specific hardcode). */
export function formatBootstrapEditionHeaders(
  sourceLanguage: string,
  targetLanguage: string,
): { sourceHeader: string; targetHeader: string; scriptLines: string[] } {
  const targetProfile = getLanguageProfile(targetLanguage);
  return {
    sourceHeader: `Source: ${formatAiLanguageIdentity(sourceLanguage)}`,
    targetHeader: `Target edition: ${formatAiLanguageIdentity(targetLanguage)}`,
    scriptLines: formatTargetScriptMetadataLines(targetProfile),
  };
}

export function formatBootstrapPairSummary(sourceLanguage: string, targetLanguage: string): string {
  const sourceProfile = getLanguageProfile(sourceLanguage);
  const targetProfile = getLanguageProfile(targetLanguage);
  return `${sourceProfile.internationalName} → ${targetProfile.internationalName}`;
}
