import type { LanguageProfile } from './language-profile';
import { resolveLanguageSearchAlias } from './language-code-aliases';
import {
  AI_SUPPORT_TIERS,
  REGION_GROUPS,
  type AiSupportTier,
  type RegionGroup,
} from './language-catalog-types';

export { AI_SUPPORT_TIERS, REGION_GROUPS };
export type { AiSupportTier, RegionGroup };

/** UI format: international on line 1; native · code implied in stacked mode. */
export function formatLanguagePickerLabel(profile: Pick<
  LanguageProfile,
  'internationalName' | 'nativeName' | 'code'
>): string {
  return `${profile.internationalName}\n${profile.nativeName} · ${profile.code}`;
}

/** Stacked UI: international name + native · code on separate lines. */
export function formatLanguagePickerStacked(profile: Pick<
  LanguageProfile,
  'internationalName' | 'nativeName' | 'code'
>): { internationalName: string; nativeLine: string } {
  return {
    internationalName: profile.internationalName,
    nativeLine: `${profile.nativeName} · ${profile.code}`,
  };
}

/** Stacked language pair: intl line + native · code line. */
export function formatLanguagePairStackedFromProfiles(
  source: Pick<LanguageProfile, 'internationalName' | 'nativeName' | 'code'>,
  target: Pick<LanguageProfile, 'internationalName' | 'nativeName' | 'code'>,
): { internationalLine: string; nativeLine: string } {
  const sourceStacked = formatLanguagePickerStacked(source);
  const targetStacked = formatLanguagePickerStacked(target);
  return {
    internationalLine: `${source.internationalName} → ${target.internationalName}`,
    nativeLine: `${sourceStacked.nativeLine} → ${targetStacked.nativeLine}`,
  };
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export const KHEPREE_NOVEL_AI_VERIFICATION_LABELS_VI: Record<
  import('./language-catalog-types').KhepreeNovelAIVerification,
  string
> = {
  VERIFIED: 'Đã xác minh',
  UNTESTED: 'Chưa kiểm thử',
  KNOWN_ISSUE: 'Đã biết lỗi',
};

export const PROVIDER_SUPPORT_LABELS_VI: Record<
  import('./language-catalog-types').ProviderSupport,
  string
> = {
  GEMINI_WEB_OFFICIAL: 'Gemini Web',
  GEMINI_API_EXTENDED: 'Gemini API',
  CATALOG_ONLY: 'Danh mục',
};

export function languageMatchesQuery(
  profile: LanguageProfile,
  query: string,
): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  const aliasTarget = resolveLanguageSearchAlias(query);
  if (aliasTarget === profile.code) return true;
  const haystack = [
    profile.code,
    profile.internationalName,
    profile.nativeName,
    profile.displayNameVi,
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return haystack.includes(q);
}

export function searchLanguageProfiles(
  profiles: LanguageProfile[],
  query: string,
): LanguageProfile[] {
  if (!query.trim()) return profiles;
  const aliasTarget = resolveLanguageSearchAlias(query);
  if (aliasTarget) {
    const hit = profiles.find((p) => p.code === aliasTarget);
    if (hit) return [hit];
  }
  return profiles.filter((p) => languageMatchesQuery(p, query));
}

export const REGION_GROUP_LABELS_VI: Record<RegionGroup, string> = {
  POPULAR: 'Phổ biến',
  EAST_ASIA: 'Đông Á',
  SOUTHEAST_ASIA: 'Đông Nam Á',
  SOUTH_ASIA: 'Nam Á',
  CENTRAL_ASIA: 'Trung Á',
  MIDDLE_EAST: 'Trung Đông',
  EUROPE: 'Châu Âu',
  AFRICA: 'Châu Phi',
  AMERICAS: 'Châu Mỹ',
  OCEANIA: 'Châu Đại Dương',
  OTHER: 'Khác',
};

export const REGION_GROUP_ORDER: RegionGroup[] = [
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
];

export function groupLanguageProfilesByRegion(
  profiles: LanguageProfile[],
): Map<RegionGroup, LanguageProfile[]> {
  const map = new Map<RegionGroup, LanguageProfile[]>();
  for (const group of REGION_GROUP_ORDER) {
    map.set(group, []);
  }
  for (const p of profiles) {
    const bucket = map.get(p.regionGroup) ?? [];
    bucket.push(p);
    map.set(p.regionGroup, bucket);
  }
  for (const [group, list] of map) {
    list.sort((a, b) => a.internationalName.localeCompare(b.internationalName));
    map.set(group, list);
  }
  return map;
}

export const AI_SUPPORT_TIER_LABELS_VI: Record<AiSupportTier, string> = {
  GEMINI_WEB_VERIFIED: 'Gemini Web (đã xác minh)',
  GEMINI_EXTENDED: 'Gemini mở rộng',
  EXPERIMENTAL: 'Thử nghiệm',
};
