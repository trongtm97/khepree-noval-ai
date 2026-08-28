/** AI translation support tier — presence in catalog ≠ identical quality. */
export const AI_SUPPORT_TIERS = [
  'GEMINI_WEB_VERIFIED',
  'GEMINI_EXTENDED',
  'EXPERIMENTAL',
] as const;

export type AiSupportTier = (typeof AI_SUPPORT_TIERS)[number];

/** UI browse groups — approximate, not strict geopolitical ontology. */
export const REGION_GROUPS = [
  'POPULAR',
  'EAST_ASIA',
  'SOUTHEAST_ASIA',
  'SOUTH_ASIA',
  'CENTRAL_ASIA',
  'MIDDLE_EAST',
  'EUROPE',
  'AFRICA',
  'AMERICAS',
  'OCEANIA',
  'OTHER',
] as const;

export type RegionGroup = (typeof REGION_GROUPS)[number];

/** Minimal seed for world catalog — expanded to full LanguageProfile at load. */
export interface LanguageCatalogSeed {
  code: string;
  internationalName: string;
  nativeName: string;
  displayNameVi: string;
  script: string;
  direction: 'ltr' | 'rtl';
  regionGroup: RegionGroup;
  aiSupportTier: AiSupportTier;
  supportsTransliteration?: boolean;
  defaultTransliterationSystem?: string;
}
