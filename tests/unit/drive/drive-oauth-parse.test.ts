import { describe, it, expect } from 'vitest';
import { parseOAuthAuthPayload } from '@main/drive/drive-oauth-service';

describe('parseOAuthAuthPayload', () => {
  it('extracts code from redirect URL', () => {
    const code = '4/0AeanS0abc123XYZ';
    const url = `http://127.0.0.1:18766/?code=${encodeURIComponent(code)}&scope=drive.file`;
    expect(parseOAuthAuthPayload(url)).toBe(code);
  });

  it('accepts raw authorization code', () => {
    const code = '4/0AeanS0rawCodeOnlyValueHere';
    expect(parseOAuthAuthPayload(code)).toBe(code);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseOAuthAuthPayload('')).toBeNull();
    expect(parseOAuthAuthPayload('   ')).toBeNull();
    expect(parseOAuthAuthPayload('not a valid url or code')).toBeNull();
  });
});
