import type { LanguageProfile } from './language-profile';
import {
  AI_SUPPORT_TIERS,
  REGION_GROUPS,
  type AiSupportTier,
  type RegionGroup,
} from './language-catalog-types';

export { AI_SUPPORT_TIERS, REGION_GROUPS };
export type { AiSupportTier, RegionGroup };

/** UI format: English — English · en */
export function formatLanguagePickerLabel(profile: Pick<
  LanguageProfile,
  'internationalName' | 'nativeName' | 'code'
>): string {
  return `${profile.internationalName} — ${profile.nativeName} · ${profile.code}`;
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

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function languageMatchesQuery(
  profile: LanguageProfile,
  query: string,
): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  const haystack = [
    profile.code,
    profile.internationalName,
    profile.nativeName,
    profile.displayNameVi,
    profile.displayNameNative,
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
