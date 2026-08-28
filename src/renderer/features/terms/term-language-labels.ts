import { getLanguageProfile } from '@shared/constants/language-profile';

export interface TermColumnLabels {
  sourceLabel: string;
  targetLabel: string;
  transliterationLabel: string | null;
}

export function termLanguageColumnLabels(
  sourceCode: string,
  targetCode: string,
): TermColumnLabels {
  const source = getLanguageProfile(sourceCode);
  const target = getLanguageProfile(targetCode);
  return {
    sourceLabel: source.internationalName,
    targetLabel: target.internationalName,
    transliterationLabel: transliterationLabelFor(source.defaultTransliterationSystem, source.supportsTransliteration),
  };
}

function transliterationLabelFor(
  system: string | undefined,
  supports: boolean,
): string | null {
  if (!supports) return null;
  if (system === 'pinyin') return 'Pinyin';
  if (system === 'romaji') return 'Romaji';
  return 'Phiên âm';
}
