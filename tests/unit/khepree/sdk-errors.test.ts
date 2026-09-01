import { describe, expect, it } from 'vitest';
import { DESKTOP_ERROR_CODES } from '@khepree/sdk';
import { mapDesktopApiErrorCode, isDesktopSdkErrorCode } from '@main/khepree/errors';

describe('khepree desktop sdk errors', () => {
  it('recognizes SDK desktop error codes', () => {
    expect(isDesktopSdkErrorCode('ENTITLEMENT_MISSING')).toBe(true);
    expect(isDesktopSdkErrorCode('DEVICE_LIMIT_REACHED')).toBe(true);
    expect(isDesktopSdkErrorCode('NOT_A_REAL_CODE')).toBe(false);
    expect(DESKTOP_ERROR_CODES).toContain('ENTITLEMENT_MISSING');
  });

  it('maps legacy device limit code to SDK code', () => {
    expect(mapDesktopApiErrorCode('DEVICE_LIMIT')).toBe('DEVICE_LIMIT_REACHED');
  });
});
