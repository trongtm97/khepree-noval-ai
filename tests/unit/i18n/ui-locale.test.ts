import { describe, expect, it, beforeEach } from 'vitest';
import {
  normalizeUiLocalePreference,
  resolveSystemUiLocale,
  resolveUiLocale,
} from '../../../src/shared/types/ui-locale';
import { getResolvedUiLocale, t, useLocaleStore, applyUiLanguageStatus } from '../../../src/renderer/i18n';

describe('ui locale resolution', () => {
  beforeEach(() => {
    useLocaleStore.setState({ preference: 'vi' });
  });

  it('normalizes invalid preference to vi', () => {
    expect(normalizeUiLocalePreference('fr')).toBe('vi');
    expect(normalizeUiLocalePreference(null)).toBe('vi');
  });

  it('resolves system preference from language list', () => {
    expect(resolveSystemUiLocale(['en-US', 'vi-VN'])).toBe('en');
    expect(resolveSystemUiLocale(['vi-VN'])).toBe('vi');
    expect(resolveSystemUiLocale(['ja-JP'])).toBe('vi');
  });

  it('resolves direct preferences', () => {
    expect(resolveUiLocale('en')).toBe('en');
    expect(resolveUiLocale('system')).toBe(resolveSystemUiLocale());
  });

  it('switches UI strings immediately vi → en', () => {
    useLocaleStore.getState().setPreference('vi');
    expect(t('nav.dashboard')).toBe('Tổng quan');
    useLocaleStore.getState().setPreference('en');
    expect(t('nav.dashboard')).toBe('Overview');
    expect(getResolvedUiLocale()).toBe('en');
  });

  it('stores preference in memory after setPreference', () => {
    useLocaleStore.getState().setPreference('en');
    expect(useLocaleStore.getState().preference).toBe('en');
    useLocaleStore.getState().setPreference('system');
    expect(useLocaleStore.getState().preference).toBe('system');
  });

  it('applyUiLanguageStatus hydrates from server state', () => {
    applyUiLanguageStatus({
      preference: 'en',
      locale: 'en',
      chosen: true,
      needsFirstRunChooser: false,
    });
    expect(useLocaleStore.getState().preference).toBe('en');
    expect(useLocaleStore.getState().hydrated).toBe(true);
    expect(t('nav.dashboard')).toBe('Overview');
  });

  it('migrates legacy persisted locale field', () => {
    expect(normalizeUiLocalePreference(undefined)).toBe('vi');
    expect(normalizeUiLocalePreference('en')).toBe('en');
  });
});
