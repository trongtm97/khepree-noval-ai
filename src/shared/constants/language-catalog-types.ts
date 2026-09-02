/** AI translation support tier — derived from providerSupport (backward compat). */
export const AI_SUPPORT_TIERS = [
  'GEMINI_WEB_VERIFIED',
  'GEMINI_EXTENDED',
  'EXPERIMENTAL',
] as const;

export type AiSupportTier = (typeof AI_SUPPORT_TIERS)[number];

/** Google provider UI/API availability — not Khepree Novel AI quality. */
export const PROVIDER_SUPPORT_LEVELS = [
  'GEMINI_WEB_OFFICIAL',
  'GEMINI_API_EXTENDED',
  'CATALOG_ONLY',
] as const;

export type ProviderSupport = (typeof PROVIDER_SUPPORT_LEVELS)[number];

/** Khepree Novel AI end-to-end translation workflow evidence. */
export const KHEPREE_NOVEL_AI_VERIFICATION_LEVELS = [
  'VERIFIED',
  'UNTESTED',
  'KNOWN_ISSUE',
] as const;

export type KhepreeNovelAIVerification = (typeof KHEPREE_NOVEL_AI_VERIFICATION_LEVELS)[number];

export interface LanguageProviderSupport {
  providerId: string;
  status: ProviderSupport;
  verifiedAt?: string;
  source?: string;
}

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
  providerSupport: ProviderSupport;
  khepreeNovelAiVerification: KhepreeNovelAIVerification;
  /** @deprecated Derived from providerSupport — use providerSupport + khepreeNovelAiVerification. */
  aiSupportTier: AiSupportTier;
  supportsTransliteration?: boolean;
  defaultTransliterationSystem?: string;
}
