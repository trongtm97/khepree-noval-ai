import { describe, expect, it } from 'vitest';
import { resolveSafeAnnouncementCta } from '@main/khepree/announcement-cta-policy';

describe('announcement CTA policy', () => {
  it('maps safe internal path to open-settings', () => {
    expect(
      resolveSafeAnnouncementCta({
        kind: 'open_path',
        payload: { path: '/settings' },
      }),
    ).toEqual({ action: 'open-settings' });
  });

  it('allows first-party https URL', () => {
    expect(
      resolveSafeAnnouncementCta({
        kind: 'open_url',
        payload: { url: 'https://khepree.com/support' },
      }),
    ).toEqual({ action: 'open-url', url: 'https://khepree.com/support' });
  });

  it('rejects javascript URL', () => {
    expect(
      resolveSafeAnnouncementCta({
        kind: 'open_url',
        payload: { url: 'javascript:alert(1)' },
      }),
    ).toBeNull();
  });

  it('rejects unknown internal path', () => {
    expect(
      resolveSafeAnnouncementCta({
        kind: 'open_path',
        payload: { path: '/etc/passwd' },
      }),
    ).toBeNull();
  });

  it('rejects shell metacharacters in path', () => {
    expect(
      resolveSafeAnnouncementCta({
        kind: 'open_path',
        payload: { path: '/settings; rm -rf /' },
      }),
    ).toBeNull();
  });
});
