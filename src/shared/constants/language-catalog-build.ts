import type {
  LanguageCatalogSeed,
  RegionGroup,
} from './language-catalog-types';
import type {
  LanguageProfile,
  PunctuationProfile,
  QuoteStyle,
  SegmentationStrategy,
} from './language-profile';

const CJK_SCRIPTS = new Set(['Hans', 'Hant', 'Jpan', 'Kore']);
const RTL_SCRIPTS = new Set(['Arab', 'Hebr']);
const THAI_SCRIPT = 'Thai';

function segmentationForScript(script: string): SegmentationStrategy {
  if (CJK_SCRIPTS.has(script)) return 'cjk_char';
  if (script === THAI_SCRIPT) return 'thai';
  if (script === 'Latn' || script === 'Cyrl' || script === 'Grek') return 'whitespace';
  return 'mixed';
}

function quoteStyleForScript(script: string): QuoteStyle {
  if (CJK_SCRIPTS.has(script)) return 'cjk_corner';
  if (script === 'Cyrl') return 'guillemet';
  return 'curly';
}

function punctuationForScript(script: string, direction: 'ltr' | 'rtl'): PunctuationProfile {
  if (script === 'Arab' || direction === 'rtl') return 'arabic';
  if (CJK_SCRIPTS.has(script)) return 'cjk';
  if (script === THAI_SCRIPT) return 'thai';
  return 'western';
}

function transliterationFor(code: string, script: string): {
  supportsTransliteration: boolean;
  defaultTransliterationSystem?: string;
} {
  if (code === 'zh-Hans' || code === 'zh-Hant') {
    return { supportsTransliteration: true, defaultTransliterationSystem: 'pinyin' };
  }
  if (code === 'ja') return { supportsTransliteration: true, defaultTransliterationSystem: 'romaji' };
  if (code === 'ko') {
    return { supportsTransliteration: true, defaultTransliterationSystem: 'revised_romanization' };
  }
  if (code === 'ru') return { supportsTransliteration: true, defaultTransliterationSystem: 'iso9' };
  if (code === 'ar') return { supportsTransliteration: true, defaultTransliterationSystem: 'ala_lc' };
  if (code === 'th') return { supportsTransliteration: true, defaultTransliterationSystem: 'rtgs' };
  if (RTL_SCRIPTS.has(script) || script === 'Arab') {
    return { supportsTransliteration: true };
  }
  if (script === 'Cyrl') return { supportsTransliteration: true };
  if (['Deva', 'Beng', 'Guru', 'Gujr', 'Orya', 'Taml', 'Telu', 'Knda', 'Mlym', 'Sinh'].includes(script)) {
    return { supportsTransliteration: true };
  }
  return { supportsTransliteration: false };
}

/** Expand catalog seed into full LanguageProfile with script-based defaults. */
export function buildLanguageProfile(seed: LanguageCatalogSeed): LanguageProfile {
  const translit = seed.supportsTransliteration != null
    ? {
        supportsTransliteration: seed.supportsTransliteration,
        defaultTransliterationSystem: seed.defaultTransliterationSystem,
      }
    : transliterationFor(seed.code, seed.script);

  return {
    code: seed.code,
    internationalName: seed.internationalName,
    nativeName: seed.nativeName,
    displayNameVi: seed.displayNameVi,
    displayNameNative: seed.nativeName,
    script: seed.script,
    direction: seed.direction,
    regionGroup: seed.regionGroup,
    providerSupport: seed.providerSupport,
    khepreeNovelAiVerification: seed.khepreeNovelAiVerification,
    aiSupportTier: seed.aiSupportTier,
    segmentationStrategy: segmentationForScript(seed.script),
    quoteStyle: quoteStyleForScript(seed.script),
    punctuationProfile: punctuationForScript(seed.script, seed.direction),
    ...translit,
  };
}

export function isPopularRegion(group: RegionGroup): boolean {
  return group === 'POPULAR';
}
