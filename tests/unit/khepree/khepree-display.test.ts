import { describe, expect, it } from 'vitest';
import {
  maskKhepreeEmail,
  formatKhepreeRenewalLine,
  formatKhepreeDevicesCount,
} from '@renderer/features/khepree/khepree-display';

describe('khepree-display', () => {
  it('masks email local part', () => {
    expect(maskKhepreeEmail('dev@khepree.local')).toBe('d**@khepree.local');
  });

  it('shows renewal line when lease expiry supplied', () => {
    const line = formatKhepreeRenewalLine(
      (key, params) =>
        key === 'khepree.account.renewalActive' ? `Valid until ${params?.date ?? ''}` : key,
      {
        leaseExpiresAt: '2030-01-15T00:00:00.000Z',
        graceUntil: null,
        leaseValid: true,
      },
    );
    expect(line).toContain('2030');
  });

  it('returns null renewal when no server expiry', () => {
    expect(
      formatKhepreeRenewalLine(() => '', {
        leaseExpiresAt: null,
        graceUntil: null,
        leaseValid: false,
      }),
    ).toBeNull();
  });

  it('formats device counts without question marks', () => {
    const t = (key: string, params?: Record<string, string | number>) => {
      if (key === 'khepree.devices.unavailable') return 'Unavailable';
      if (key === 'khepree.account.devicesCount') {
        return `${params?.used ?? ''} / ${params?.max ?? ''}`;
      }
      return key;
    };
    expect(formatKhepreeDevicesCount(t, null, null)).toBe('Unavailable');
    expect(formatKhepreeDevicesCount(t, 1, 2)).toContain('1');
  });
});
