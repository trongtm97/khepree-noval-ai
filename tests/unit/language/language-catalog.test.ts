import { describe, expect, it } from 'vitest';
import {
  AI_SUPPORT_TIERS,
  GEMINI_WEB_VERIFIED_CODES,
  TEXT_DIRECTIONS,
  formatLanguagePickerLabel,
  getLanguageProfile,
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
  });

  it('every entry has non-empty internationalName and nativeName', () => {
    for (const p of profiles) {
      expect(p.internationalName.trim().length).toBeGreaterThan(0);
      expect(p.nativeName.trim().length).toBeGreaterThan(0);
      expect(p.displayNameVi.trim().length).toBeGreaterThan(0);
    }
  });

  it('valid direction and support tier on every entry', () => {
    for (const p of profiles) {
      expect(TEXT_DIRECTIONS).toContain(p.direction);
      expect(AI_SUPPORT_TIERS).toContain(p.aiSupportTier);
      expect(p.script.trim().length).toBeGreaterThan(0);
    }
  });

  it('picker label format: international — native · code', () => {
    expect(formatLanguagePickerLabel(getLanguageProfile('en'))).toBe(
      'English — English · en',
    );
    expect(formatLanguagePickerLabel(getLanguageProfile('ja'))).toBe(
      'Japanese — 日本語 · ja',
    );
    expect(formatLanguagePickerLabel(getLanguageProfile('ar'))).toBe(
      'Arabic — العربية · ar',
    );
    expect(formatLanguagePickerLabel(getLanguageProfile('zh-Hans'))).toBe(
      'Chinese (Simplified) — 简体中文 · zh-Hans',
    );
  });

  it('RTL languages have rtl direction', () => {
    for (const code of ['ar', 'he', 'fa', 'ur', 'ps']) {
      expect(getLanguageProfile(code).direction).toBe('rtl');
    }
  });

  it('all Gemini Web verified codes exist in catalog', () => {
    for (const code of GEMINI_WEB_VERIFIED_CODES) {
      expect(profiles.some((p) => p.code === code)).toBe(true);
    }
  });

  it('search finds Japanese by japan, ja, native, and Vietnamese name', () => {
    const ja = getLanguageProfile('ja');
    expect(searchLanguageProfiles(profiles, 'japan').some((p) => p.code === 'ja')).toBe(true);
    expect(searchLanguageProfiles(profiles, '日本').some((p) => p.code === 'ja')).toBe(true);
    expect(searchLanguageProfiles(profiles, 'ja').some((p) => p.code === 'ja')).toBe(true);
    expect(searchLanguageProfiles(profiles, 'nhật').some((p) => p.code === 'ja')).toBe(true);
    expect(ja.internationalName).toBe('Japanese');
  });

  it('normalizes BCP-47 script variants', () => {
    expect(normalizeLanguageCode('pt-br')).toBe('pt-BR');
    expect(normalizeLanguageCode('sr-latn')).toBe('sr-Latn');
    expect(normalizeLanguageCode('zh-hans')).toBe('zh-Hans');
  });
});
