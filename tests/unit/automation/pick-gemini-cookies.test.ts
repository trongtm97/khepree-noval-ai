import { describe, it, expect } from 'vitest';
import { pickGeminiCookies } from '@main/automation/browser-runner/browser-session-controller';

describe('pickGeminiCookies', () => {
  it('extracts PSID cookies by name', () => {
    const cookies = pickGeminiCookies([
      { name: 'SID', value: 'ignored' },
      { name: '__Secure-1PSID', value: 'abc123' },
      { name: '__Secure-1PSIDTS', value: 'ts456' },
    ]);
    expect(cookies).toEqual({
      secure1psid: 'abc123',
      secure1psidts: 'ts456',
    });
  });

  it('returns empty strings when cookies missing', () => {
    expect(pickGeminiCookies([])).toEqual({
      secure1psid: '',
      secure1psidts: '',
    });
  });
});
