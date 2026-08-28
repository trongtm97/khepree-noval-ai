import { describe, expect, it } from 'vitest';
import {
  GEMINI_WEB_OFFICIAL_CODES,
  GEMINI_WEB_OFFICIAL_AUDIT_DATE,
  NOVELTRANS_VERIFIED_CODES,
} from '@shared/constants/gemini-web-official-2026';
import {
  AI_SUPPORT_TIERS,
  GEMINI_WEB_VERIFIED_CODES,
  LANGUAGE_CODE_ALIASES,
  TEXT_DIRECTIONS,
  formatLanguagePickerLabel,
  formatLanguagePickerStacked,
  getLanguageProfile,
  listLanguageCatalogCodes,
  listLanguageProfiles,
  normalizeLanguageCode,
  searchLanguageProfiles,
} from '@shared/constants/language-profile';
import { WORLD_LANGUAGE_CATALOG } from '@shared/constants/world-language-catalog';

describe('World Language Catalog', () => {
  const profiles = listLanguageProfiles();

  it('has 100+ language entries', () => {
    expect(profiles.length).toBeGreaterThanOrEqual(100);
    expect(WORLD_LANGUAGE_CATALOG.length).toBeGreaterThanOrEqual(100);
  });

  it('has unique canonical codes', () => {
    const codes = profiles.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(listLanguageCatalogCodes().sort()).toEqual([...codes].sort());
  });

  it('has no duplicate jw catalog row — jw is alias only', () => {
    expect(profiles.some((p) => p.code === 'jw')).toBe(false);
    expect(LANGUAGE_CODE_ALIASES.jw).toBe('jv');
    expect(normalizeLanguageCode('jw')).toBe('jv');
  });

  it('separates Filipino (fil) and Tagalog (tl)', () => {
    expect(getLanguageProfile('fil').internationalName).toBe('Filipino');
    expect(getLanguageProfile('tl').internationalName).toBe('Tagalog');
  });

  it('every entry has required display fields', () => {
    for (const p of profiles) {
      expect(p.internationalName.trim().length).toBeGreaterThan(0);
      expect(p.nativeName.trim().length).toBeGreaterThan(0);
      expect(p.displayNameVi.trim().length).toBeGreaterThan(0);
      expect(p.script.trim().length).toBeGreaterThan(0);
      expect(TEXT_DIRECTIONS).toContain(p.direction);
      expect(AI_SUPPORT_TIERS).toContain(p.aiSupportTier);
      expect(['GEMINI_WEB_OFFICIAL', 'GEMINI_API_EXTENDED', 'CATALOG_ONLY']).toContain(
        p.providerSupport,
      );
      expect(['VERIFIED', 'UNTESTED', 'KNOWN_ISSUE']).toContain(p.novelTransVerification);
    }
  });

  it('stacked picker label: international + native · code', () => {
    const stacked = formatLanguagePickerStacked(getLanguageProfile('ja'));
    expect(stacked.internationalName).toBe('Japanese');
    expect(stacked.nativeLine).toBe('日本語 · ja');
    expect(formatLanguagePickerLabel(getLanguageProfile('fa'))).toContain('فارسی · fa');
  });

  it('RTL languages have rtl direction', () => {
    for (const code of ['ar', 'he', 'fa', 'ur', 'ps']) {
      expect(getLanguageProfile(code).direction).toBe('rtl');
    }
  });

  it('every official Gemini Web language maps to GEMINI_WEB_OFFICIAL', () => {
    for (const code of GEMINI_WEB_OFFICIAL_CODES) {
      const profile = profiles.find((p) => p.code === code);
      expect(profile, `missing catalog entry for official Gemini Web language: ${code}`).toBeDefined();
      expect(profile?.providerSupport).toBe('GEMINI_WEB_OFFICIAL');
    }
  });

  it('fixture audit date is set', () => {
    expect(GEMINI_WEB_OFFICIAL_AUDIT_DATE).toBe('2026-08-29');
  });

  it('NovelTrans VERIFIED is subset of official Web languages', () => {
    for (const code of NOVELTRANS_VERIFIED_CODES) {
      expect(GEMINI_WEB_OFFICIAL_CODES.has(code)).toBe(true);
      expect(getLanguageProfile(code).novelTransVerification).toBe('VERIFIED');
    }
  });

  it('official but untested languages are not labeled VERIFIED', () => {
    const untestedOfficial = profiles.filter(
      (p) => p.providerSupport === 'GEMINI_WEB_OFFICIAL' && !NOVELTRANS_VERIFIED_CODES.has(p.code),
    );
    expect(untestedOfficial.length).toBeGreaterThan(0);
    for (const p of untestedOfficial) {
      expect(p.novelTransVerification).toBe('UNTESTED');
    }
  });

  it('search finds Persian by farsi, fa, native, and Vietnamese name', () => {
    expect(searchLanguageProfiles(profiles, 'farsi').some((p) => p.code === 'fa')).toBe(true);
    expect(searchLanguageProfiles(profiles, 'fa').some((p) => p.code === 'fa')).toBe(true);
    expect(searchLanguageProfiles(profiles, 'فارسی').some((p) => p.code === 'fa')).toBe(true);
    expect(searchLanguageProfiles(profiles, 'bà tư').some((p) => p.code === 'fa')).toBe(true);
  });

  it('search jw resolves to Javanese jv without duplicate row', () => {
    const hits = searchLanguageProfiles(profiles, 'jw');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.code).toBe('jv');
  });

  it('normalizes legacy aliases', () => {
    expect(normalizeLanguageCode('pt-br')).toBe('pt-BR');
    expect(normalizeLanguageCode('sr-latn')).toBe('sr-Latn');
    expect(normalizeLanguageCode('zh-hans')).toBe('zh-Hans');
    expect(normalizeLanguageCode('jw')).toBe('jv');
    expect(normalizeLanguageCode('iw')).toBe('he');
    expect(normalizeLanguageCode('in')).toBe('id');
    expect(normalizeLanguageCode('zh-hk')).toBe('zh-HK');
  });

  it('deprecated GEMINI_WEB_VERIFIED_CODES export matches official set', () => {
    expect(GEMINI_WEB_VERIFIED_CODES).toEqual(GEMINI_WEB_OFFICIAL_CODES);
  });
});

describe('core translation pair catalog presence', () => {
  const pairs = [
    ['zh-Hans', 'vi'],
    ['zh-Hant', 'en'],
    ['ja', 'vi'],
    ['ko', 'en'],
    ['en', 'vi'],
    ['fr', 'en'],
    ['es', 'vi'],
    ['de', 'en'],
    ['ru', 'vi'],
    ['uk', 'en'],
    ['ar', 'vi'],
    ['fa', 'en'],
    ['ur', 'vi'],
    ['hi', 'en'],
    ['bn', 'vi'],
    ['th', 'en'],
    ['id', 'vi'],
    ['ms', 'en'],
    ['tr', 'vi'],
    ['pl', 'en'],
  ] as const;

  it.each(pairs)('%s → %s codes exist in catalog', (source, target) => {
    expect(getLanguageProfile(source).code).toBe(source);
    expect(getLanguageProfile(target).code).toBe(target);
  });
});
