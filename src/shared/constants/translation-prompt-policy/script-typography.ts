import { getLanguageProfile, normalizeLanguageCode } from '../language-profile';

/** Layer F — script, quotes, punctuation from LanguageProfile. */
export function resolveScriptTypographyRules(
  sourceLanguage: string,
  targetLanguage: string,
): string[] {
  const source = getLanguageProfile(sourceLanguage);
  const target = getLanguageProfile(targetLanguage);
  const rules: string[] = [];

  if (source.direction === 'rtl') {
    rules.push(
      'Source is RTL script: read names and formulas in source order; do not mirror incorrectly in target.',
    );
  }
  if (target.direction === 'rtl') {
    rules.push(
      'Target is RTL: use right-to-left punctuation and reading order in the translation.',
    );
  }

  if (target.quoteStyle === 'cjk_corner') {
    rules.push(
      `Target typography (quoteStyle=${target.quoteStyle}): use corner quotation marks (「」 or 『』) per target convention.`,
    );
  } else if (target.quoteStyle === 'guillemet') {
    rules.push(
      `Target typography (quoteStyle=${target.quoteStyle}): use guillemet-style quotes where appropriate for dialogue.`,
    );
  } else if (target.quoteStyle === 'curly') {
    rules.push(
      `Target typography (quoteStyle=${target.quoteStyle}): use curly quotation marks for dialogue.`,
    );
  } else if (target.quoteStyle === 'ascii') {
    rules.push(
      `Target typography (quoteStyle=${target.quoteStyle}): use ASCII-style quotes where appropriate.`,
    );
  }

  if (target.punctuationProfile === 'cjk') {
    rules.push(
      `Target punctuation (punctuationProfile=${target.punctuationProfile}): follow CJK full-width punctuation conventions.`,
    );
  } else if (target.punctuationProfile === 'arabic') {
    rules.push(
      `Target punctuation (punctuationProfile=${target.punctuationProfile}): follow Arabic-script punctuation conventions.`,
    );
  } else if (target.punctuationProfile === 'western') {
    rules.push(
      `Target punctuation (punctuationProfile=${target.punctuationProfile}): follow Western punctuation conventions for ${target.nativeName}.`,
    );
  } else if (target.punctuationProfile === 'thai') {
    rules.push(
      `Target punctuation (punctuationProfile=${target.punctuationProfile}): follow Thai punctuation conventions.`,
    );
  }

  if (source.segmentationStrategy === 'cjk_char') {
    rules.push(
      'Source is CJK-dense: do not insert spaces inside names or terms unless the target language requires it.',
    );
  }

  const targetCode = normalizeLanguageCode(targetLanguage);
  if (!rules.length) {
    rules.push(
      `Target script: ${target.script} (${targetCode}); follow native typography for ${target.nativeName}.`,
    );
  }

  return rules;
}
