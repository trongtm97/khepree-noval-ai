import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_CONTACTS,
  OFFICIAL_CONTACT_ORDER,
  isOfficialContactChannel,
  resolveOfficialContactUrl,
} from '@shared/constants/official-contacts';

describe('official contact constants', () => {
  it('defines all five canonical channels with exact URLs and display values', () => {
    expect(OFFICIAL_CONTACTS.facebook.url).toBe('https://www.facebook.com/KhepreeLabs');
    expect(OFFICIAL_CONTACTS.facebook.display).toBe('Khepree Labs');

    expect(OFFICIAL_CONTACTS.youtube.url).toBe('https://www.youtube.com/@KhepreeLabs');
    expect(OFFICIAL_CONTACTS.youtube.display).toBe('KhepreeLabs');

    expect(OFFICIAL_CONTACTS.tiktok.url).toBe('https://www.tiktok.com/@khepreelabs');
    expect(OFFICIAL_CONTACTS.tiktok.display).toBe('khepreelabs');

    expect(OFFICIAL_CONTACTS.telegram.url).toBe('https://t.me/KhepreeLabs');
    expect(OFFICIAL_CONTACTS.telegram.display).toBe('KhepreeLabs');

    expect(OFFICIAL_CONTACTS.zalo.url).toBe('https://zalo.me/0867268149');
    expect(OFFICIAL_CONTACTS.zalo.display).toBe('0867.268.149');
  });

  it('orders channels for UI rendering', () => {
    expect(OFFICIAL_CONTACT_ORDER).toEqual(['facebook', 'youtube', 'tiktok', 'telegram', 'zalo']);
  });

  it('resolves URLs from channel ids', () => {
    expect(resolveOfficialContactUrl('facebook')).toBe(OFFICIAL_CONTACTS.facebook.url);
    expect(resolveOfficialContactUrl('zalo')).toBe(OFFICIAL_CONTACTS.zalo.url);
  });

  it('validates official contact channel ids', () => {
    expect(isOfficialContactChannel('facebook')).toBe(true);
    expect(isOfficialContactChannel('evil')).toBe(false);
    expect(isOfficialContactChannel('../facebook')).toBe(false);
    expect(isOfficialContactChannel('')).toBe(false);
  });
});
