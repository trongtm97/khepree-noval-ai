/**
 * LanguageProfile — World Language Catalog (BCP-47 / ISO 639-1).
 * Registry is extensible: registerLanguageProfile() adds/overrides entries.
 * Default project pair remains zh-Hans → vi for compatibility.
 */

import { buildLanguageProfile } from './language-catalog-build';
import type { AiSupportTier, RegionGroup } from './language-catalog-types';
import { WORLD_LANGUAGE_CATALOG } from './world-language-catalog';

export type { AiSupportTier, RegionGroup };
export { AI_SUPPORT_TIERS, REGION_GROUPS } from './language-catalog-types';
export {
  GEMINI_WEB_VERIFIED_CODES,
  GEMINI_EXTENDED_CODES,
} from './world-language-catalog';
export {
  formatLanguagePickerLabel,
  formatLanguagePickerStacked,
  searchLanguageProfiles,
  groupLanguageProfilesByRegion,
  REGION_GROUP_LABELS_VI,
  REGION_GROUP_ORDER,
  AI_SUPPORT_TIER_LABELS_VI,
} from './language-catalog-search';

/** Known script tags — open string on profile; not a closed enum blocker. */
export const LANGUAGE_SCRIPTS = [
  'Latn', 'Hans', 'Hant', 'Jpan', 'Kore', 'Cyrl', 'Arab', 'Hebr', 'Thai',
  'Deva', 'Beng', 'Guru', 'Gujr', 'Orya', 'Taml', 'Telu', 'Knda', 'Mlym',
  'Sinh', 'Khmr', 'Laoo', 'Mymr', 'Ethi', 'Geor', 'Armn', 'Grek', 'Tibt',
] as const;

export type LanguageScript = (typeof LANGUAGE_SCRIPTS)[number] | string;

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
  internationalName: string;
  nativeName: string;
  /** Vietnamese UI localization label. */
  displayNameVi: string;
  /** @deprecated Use nativeName — kept for backward compatibility. */
  displayNameNative: string;
  /** BCP-47 script subtag (open string). */
  script: string;
  direction: TextDirection;
  regionGroup: RegionGroup;
  aiSupportTier: AiSupportTier;
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
  'pt-br': 'pt-BR',
  'pt-pt': 'pt-PT',
  rus: 'ru',
  ara: 'ar',
  tha: 'th',
  ind: 'id',
  'sr-latn': 'sr-Latn',
  'sr-cyrl': 'sr-Cyrl',
  'az-latn': 'az-Latn',
  'az-cyrl': 'az-Cyrl',
  'uz-latn': 'uz-Latn',
};

export const DEFAULT_SOURCE_LANGUAGE = 'zh-Hans';
export const DEFAULT_TARGET_LANGUAGE = 'vi';

const registry = new Map<string, LanguageProfile>(
  WORLD_LANGUAGE_CATALOG.map((seed) => {
    const profile = buildLanguageProfile(seed);
    return [profile.code, profile] as const;
  }),
);

/** Register or replace a profile (extensible registry). */
export function registerLanguageProfile(profile: LanguageProfile): void {
  const code = normalizeLanguageCode(profile.code);
  registry.set(code, {
    ...profile,
    code,
    displayNameNative: profile.nativeName ?? profile.displayNameNative,
    nativeName: profile.nativeName ?? profile.displayNameNative,
    internationalName: profile.internationalName ?? profile.displayNameNative,
  });
}

export function listLanguageProfiles(): LanguageProfile[] {
  return [...registry.values()].sort((a, b) =>
    a.internationalName.localeCompare(b.internationalName),
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
  const mapped = LEGACY_LANGUAGE_CODE_MAP[trimmed] ?? LEGACY_LANGUAGE_CODE_MAP[lower];
  if (mapped) return mapped;
  if (registry.has(trimmed)) return trimmed;
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
    internationalName: normalized,
    nativeName: normalized,
    displayNameVi: normalized,
    displayNameNative: normalized,
    script: 'Latn',
    direction: 'ltr',
    regionGroup: 'OTHER',
    aiSupportTier: 'EXPERIMENTAL',
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
  if (profile.code === 'zh-Hans') return '中文';
  if (profile.code === 'zh-Hant') return '繁中';
  return profile.nativeName;
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
    `Source language: ${source.nativeName}`,
    `Target language: ${target.nativeName}`,
    `Translate: ${source.nativeName} → ${target.nativeName}`,
    `Style: ${style}; Range: ${range}`,
  ].join(' | ');
}
