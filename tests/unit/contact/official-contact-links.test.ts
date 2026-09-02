import { describe, expect, it, vi, beforeEach } from 'vitest';

const { openExternalMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock,
  },
}));

import {
  isAllowedOfficialContactUrl,
  openOfficialContact,
} from '@main/app/official-contact-links';
import { OFFICIAL_CONTACTS } from '@shared/constants/official-contacts';

describe('official contact links', () => {
  beforeEach(() => {
    openExternalMock.mockClear();
  });

  it.each([
    ['facebook', OFFICIAL_CONTACTS.facebook.url],
    ['youtube', OFFICIAL_CONTACTS.youtube.url],
    ['tiktok', OFFICIAL_CONTACTS.tiktok.url],
    ['telegram', OFFICIAL_CONTACTS.telegram.url],
    ['zalo', OFFICIAL_CONTACTS.zalo.url],
  ] as const)('opens %s with exact canonical URL', async (channel, url) => {
    const ok = await openOfficialContact(channel);
    expect(ok).toBe(true);
    expect(openExternalMock).toHaveBeenCalledTimes(1);
    expect(openExternalMock).toHaveBeenCalledWith(url);
  });

  it.each(['evil', '../facebook', ''])('rejects invalid channel %j without shell', async (channel) => {
    const ok = await openOfficialContact(channel);
    expect(ok).toBe(false);
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('allows official HTTPS URLs with exact approved hostnames', () => {
    expect(isAllowedOfficialContactUrl(OFFICIAL_CONTACTS.facebook.url)).toBe(true);
    expect(isAllowedOfficialContactUrl(OFFICIAL_CONTACTS.youtube.url)).toBe(true);
    expect(isAllowedOfficialContactUrl(OFFICIAL_CONTACTS.tiktok.url)).toBe(true);
    expect(isAllowedOfficialContactUrl(OFFICIAL_CONTACTS.telegram.url)).toBe(true);
    expect(isAllowedOfficialContactUrl(OFFICIAL_CONTACTS.zalo.url)).toBe(true);
  });

  it('rejects unsafe or spoofed URLs', () => {
    expect(isAllowedOfficialContactUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedOfficialContactUrl('file:///C:/Windows/System32')).toBe(false);
    expect(isAllowedOfficialContactUrl('data:text/html,hello')).toBe(false);
    expect(isAllowedOfficialContactUrl('ftp://example.com')).toBe(false);
    expect(isAllowedOfficialContactUrl('http://attacker.example')).toBe(false);
    expect(isAllowedOfficialContactUrl('https://facebook.com.attacker.example')).toBe(false);
  });
});
