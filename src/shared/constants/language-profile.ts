/**
 * LanguageProfile — translation-pair domain (BCP-47-ish codes).
 * Registry is extensible: registerLanguageProfile() adds/overrides entries.
 * Default project pair remains zh-Hans → vi for compatibility.
 */

export const LANGUAGE_SCRIPTS = [
  'Latn',
  'Hans',
  'Hant',
  'Jpan',
  'Kore',
  'Cyrl',
  'Arab',
  'Hebr',
  'Thai',
  'Other',
] as const;

export type LanguageScript = (typeof LANGUAGE_SCRIPTS)[number];

export const TEXT_DIRECTIONS = ['ltr', 'rtl'] as const;
export type TextDirection = (typeof TEXT_DIRECTIONS)[number];

export const SEGMENTATION_STRATEGIES = [
  'whitespace',
  'cjk_char',
  'thai',
  'mixed',
] as const;

export type SegmentationStrategy = (typeof SEGMENTATION_STRATEGIES)[number];

export const QUOTE_STYLES = [
  'ascii',
  'curly',
  'cjk_corner',
  'guillemet',
] as const;

export type QuoteStyle = (typeof QUOTE_STYLES)[number];

export const PUNCTUATION_PROFILES = [
  'western',
  'cjk',
  'arabic',
  'thai',
] as const;

export type PunctuationProfile = (typeof PUNCTUATION_PROFILES)[number];

export interface LanguageProfile {
  code: string;
  displayNameVi: string;
  displayNameNative: string;
  script: LanguageScript;
  direction: TextDirection;
  segmentationStrategy: SegmentationStrategy;
  quoteStyle: QuoteStyle;
  punctuationProfile: PunctuationProfile;
  supportsTransliteration: boolean;
  defaultTransliterationSystem?: string;
}

/** Sentinel for create/detect — never persisted on projects. */
export const LANGUAGE_AUTO = 'AUTO';

/** Legacy code → canonical BCP-47-ish. */
export const LEGACY_LANGUAGE_CODE_MAP: Readonly<Record<string, string>> = {
  zh: 'zh-Hans',
  'zh-CN': 'zh-Hans',
  'zh-SG': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-HK': 'zh-Hant',
  'zh-MO': 'zh-Hant',
  chi: 'zh-Hans',
  zho: 'zh-Hans',
  vie: 'vi',
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  fra: 'fr',
  deu: 'de',
  spa: 'es',
  por: 'pt',
  rus: 'ru',
  ara: 'ar',
  tha: 'th',
  ind: 'id',
};

export const DEFAULT_SOURCE_LANGUAGE = 'zh-Hans';
export const DEFAULT_TARGET_LANGUAGE = 'vi';

const BUILTIN_PROFILES: LanguageProfile[] = [
  {
    code: 'zh-Hans',
    displayNameVi: 'Tiếng Trung giản thể',
    displayNameNative: '简体中文',
    script: 'Hans',
    direction: 'ltr',
    segmentationStrategy: 'cjk_char',
    quoteStyle: 'cjk_corner',
    punctuationProfile: 'cjk',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'pinyin',
  },
  {
    code: 'zh-Hant',
    displayNameVi: 'Tiếng Trung phồn thể',
    displayNameNative: '繁體中文',
    script: 'Hant',
    direction: 'ltr',
    segmentationStrategy: 'cjk_char',
    quoteStyle: 'cjk_corner',
    punctuationProfile: 'cjk',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'pinyin',
  },
  {
    code: 'vi',
    displayNameVi: 'Tiếng Việt',
    displayNameNative: 'Tiếng Việt',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'en',
    displayNameVi: 'Tiếng Anh',
    displayNameNative: 'English',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'ja',
    displayNameVi: 'Tiếng Nhật',
    displayNameNative: '日本語',
    script: 'Jpan',
    direction: 'ltr',
    segmentationStrategy: 'cjk_char',
    quoteStyle: 'cjk_corner',
    punctuationProfile: 'cjk',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'romaji',
  },
  {
    code: 'ko',
    displayNameVi: 'Tiếng Hàn',
    displayNameNative: '한국어',
    script: 'Kore',
    direction: 'ltr',
    segmentationStrategy: 'cjk_char',
    quoteStyle: 'cjk_corner',
    punctuationProfile: 'cjk',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'revised_romanization',
  },
  {
    code: 'fr',
    displayNameVi: 'Tiếng Pháp',
    displayNameNative: 'Français',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'guillemet',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'de',
    displayNameVi: 'Tiếng Đức',
    displayNameNative: 'Deutsch',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'es',
    displayNameVi: 'Tiếng Tây Ban Nha',
    displayNameNative: 'Español',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'pt',
    displayNameVi: 'Tiếng Bồ Đào Nha',
    displayNameNative: 'Português',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'ru',
    displayNameVi: 'Tiếng Nga',
    displayNameNative: 'Русский',
    script: 'Cyrl',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'guillemet',
    punctuationProfile: 'western',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'iso9',
  },
  {
    code: 'ar',
    displayNameVi: 'Tiếng Ả Rập',
    displayNameNative: 'العربية',
    script: 'Arab',
    direction: 'rtl',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'arabic',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'ala_lc',
  },
  {
    code: 'he',
    displayNameVi: 'Tiếng Do Thái',
    displayNameNative: 'עברית',
    script: 'Hebr',
    direction: 'rtl',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
  {
    code: 'th',
    displayNameVi: 'Tiếng Thái',
    displayNameNative: 'ไทย',
    script: 'Thai',
    direction: 'ltr',
    segmentationStrategy: 'thai',
    quoteStyle: 'curly',
    punctuationProfile: 'thai',
    supportsTransliteration: true,
    defaultTransliterationSystem: 'rtgs',
  },
  {
    code: 'id',
    displayNameVi: 'Tiếng Indonesia',
    displayNameNative: 'Bahasa Indonesia',
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'whitespace',
    quoteStyle: 'curly',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  },
];

const registry = new Map<string, LanguageProfile>(
  BUILTIN_PROFILES.map((p) => [p.code, p]),
);

/** Register or replace a profile (extensible registry). */
export function registerLanguageProfile(profile: LanguageProfile): void {
  const code = normalizeLanguageCode(profile.code);
  registry.set(code, { ...profile, code });
}

export function listLanguageProfiles(): LanguageProfile[] {
  return [...registry.values()].sort((a, b) =>
    a.displayNameVi.localeCompare(b.displayNameVi, 'vi'),
  );
}

export function hasLanguageProfile(code: string): boolean {
  return registry.has(normalizeLanguageCode(code));
}

/**
 * Normalize legacy / alias codes. AUTO stays AUTO.
 * Unknown codes keep canonical casing after trim (still usable as opaque BCP-47).
 */
export function normalizeLanguageCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_SOURCE_LANGUAGE;
  if (trimmed.toUpperCase() === LANGUAGE_AUTO) return LANGUAGE_AUTO;
  const lower = trimmed.toLowerCase();
  if (LEGACY_LANGUAGE_CODE_MAP[lower]) return LEGACY_LANGUAGE_CODE_MAP[lower];
  // Preserve region/script casing for known patterns like zh-Hans
  const mapped = LEGACY_LANGUAGE_CODE_MAP[trimmed] ?? LEGACY_LANGUAGE_CODE_MAP[lower];
  if (mapped) return mapped;
  if (registry.has(trimmed)) return trimmed;
  // Title-case script suffix: zh-hans → zh-Hans when base known
  const parts = trimmed.split('-');
  if (parts.length >= 2) {
    const base = parts[0].toLowerCase();
    const rest = parts
      .slice(1)
      .map((p) =>
        p.length <= 4 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p,
      );
    const candidate = [base === 'zh' ? 'zh' : base, ...rest].join('-');
    if (registry.has(candidate)) return candidate;
    if (base === 'zh' && rest[0]?.toLowerCase() === 'hans') return 'zh-Hans';
    if (base === 'zh' && rest[0]?.toLowerCase() === 'hant') return 'zh-Hant';
  }
  return lower.length === 2 || lower.length === 3 ? lower : trimmed;
}

/**
 * Resolve profile. Unknown codes get a safe Latin/western fallback profile
 * so core never crashes — callers may still reject unknown for create UI.
 */
export function getLanguageProfile(code: string): LanguageProfile {
  const normalized = normalizeLanguageCode(code);
  if (normalized === LANGUAGE_AUTO) {
    return getLanguageProfile(DEFAULT_SOURCE_LANGUAGE);
  }
  const hit = registry.get(normalized);
  if (hit) return hit;
  return {
    code: normalized,
    displayNameVi: normalized,
    displayNameNative: normalized,
    script: 'Latn',
    direction: 'ltr',
    segmentationStrategy: 'mixed',
    quoteStyle: 'ascii',
    punctuationProfile: 'western',
    supportsTransliteration: false,
  };
}

export function isAutoLanguage(code: string | null | undefined): boolean {
  return (code ?? '').trim().toUpperCase() === LANGUAGE_AUTO;
}

export function canSwapLanguages(
  source: string,
  target: string,
): boolean {
  if (isAutoLanguage(source) || isAutoLanguage(target)) return false;
  const s = normalizeLanguageCode(source);
  const t = normalizeLanguageCode(target);
  return s !== t;
}

export function languageCompactLabel(code: string): string {
  const profile = getLanguageProfile(code);
  // Compact Chinese for UI chrome (user-facing pairs, not BCP-47 codes).
  if (profile.code === 'zh-Hans') return '中文';
  if (profile.code === 'zh-Hant') return '繁中';
  return profile.displayNameNative;
}

/** Compact user-facing pair: 中文 → Tiếng Việt, English → Español. Never raw codes. */
export function formatLanguagePairLabel(
  sourceCode: string,
  targetCode: string,
): string {
  return `${languageCompactLabel(sourceCode)} → ${languageCompactLabel(targetCode)}`;
}

/**
 * @deprecated Prefer formatTranslationTaskHeader from translation-style-model.
 */
export function formatTranslateTaskLine(
  sourceCode: string,
  targetCode: string,
  style: string,
  range: string,
): string {
  const source = getLanguageProfile(sourceCode);
  const target = getLanguageProfile(targetCode);
  return [
    `Source language: ${source.displayNameNative}`,
    `Target language: ${target.displayNameNative}`,
    `Translate: ${source.displayNameNative} → ${target.displayNameNative}`,
    `Style: ${style}; Range: ${range}`,
  ].join(' | ');
}
