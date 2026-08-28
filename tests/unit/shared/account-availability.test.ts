import { describe, expect, it } from 'vitest';
import {
  resolveAccountAvailability,
  computeAvailabilitySummary,
  formatAvailabilityPreflightMessage,
} from '../../../src/shared/utils/account-availability';
import type { AccountAvailabilityInput } from '../../../src/shared/utils/account-availability';

const NOW = Date.parse('2026-08-28T18:00:00.000Z');

function base(overrides: Partial<AccountAvailabilityInput> = {}): AccountAvailabilityInput {
  return {
    accountId: '11111111-1111-4111-8111-111111111111',
    accountStatus: 'READY',
    workerEnabled: true,
    workerHealth: 'READY',
    workerCurrentJobId: null,
    limitedUntil: null,
    hasProfile: true,
    profileLease: null,
    runtimeHealth: null,
    profileLockBlocked: false,
    schedulerEligible: true,
    activeJob: null,
    now: NOW,
    ...overrides,
  };
}

describe('resolveAccountAvailability', () => {
  it('READY when scheduler eligible and session healthy', () => {
    const result = resolveAccountAvailability(base());
    expect(result.availability).toBe('READY');
    expect(result.uiLane).toBe('ready');
    expect(result.usableForNewJob).toBe(true);
  });

  it('PAUSED when worker disabled and session otherwise healthy', () => {
    const result = resolveAccountAvailability(
      base({ workerEnabled: false, accountStatus: 'READY' }),
    );
    expect(result.availability).toBe('PAUSED');
    expect(result.usableForNewJob).toBe(false);
  });

  it('LOGIN_REQUIRED before PAUSED when account needs login', () => {
    const result = resolveAccountAvailability(
      base({ workerEnabled: false, accountStatus: 'LOGIN_REQUIRED' }),
    );
    expect(result.availability).toBe('LOGIN_REQUIRED');
  });

  it('BUSY when active job exists', () => {
    const result = resolveAccountAvailability(
      base({
        activeJob: {
          jobId: '22222222-2222-4222-8222-222222222222',
          projectId: '33333333-3333-4333-8333-333333333333',
          projectName: 'Truyện 1',
        },
      }),
    );
    expect(result.availability).toBe('BUSY');
    expect(result.uiLane).toBe('running');
    expect(result.canRemove).toBe(false);
  });

  it('BUSY when READY account has active lease', () => {
    const result = resolveAccountAvailability(
      base({
        schedulerEligible: false,
        profileLease: { ownerId: 'job:abc', operation: 'translation', label: 'Dịch' },
      }),
    );
    expect(result.availability).toBe('BUSY');
  });

  it('LOGIN_REQUIRED dominates READY', () => {
    const result = resolveAccountAvailability(
      base({ accountStatus: 'LOGIN_REQUIRED', schedulerEligible: true }),
    );
    expect(result.availability).toBe('LOGIN_REQUIRED');
    expect(result.usableForNewJob).toBe(false);
  });

  it('LIMITED when quota cooldown active', () => {
    const result = resolveAccountAvailability(
      base({
        workerHealth: 'LIMITED',
        limitedUntil: '2026-08-28T19:00:00.000Z',
        schedulerEligible: false,
      }),
    );
    expect(result.availability).toBe('LIMITED');
    expect(result.autoRetryExpected).toBe(true);
  });

  it('NEEDS_ATTENTION for worker health', () => {
    const result = resolveAccountAvailability(
      base({ workerHealth: 'NEEDS_ATTENTION', schedulerEligible: false }),
    );
    expect(result.availability).toBe('NEEDS_ATTENTION');
  });
});

describe('computeAvailabilitySummary', () => {
  it('aggregates canonical availability states', () => {
    const summary = computeAvailabilitySummary([
      { availability: resolveAccountAvailability(base()) },
      { availability: resolveAccountAvailability(base({ workerEnabled: false })) },
      {
        availability: resolveAccountAvailability(
          base({
            activeJob: {
              jobId: '22222222-2222-4222-8222-222222222222',
              projectId: '33333333-3333-4333-8333-333333333333',
            },
          }),
        ),
      },
      {
        availability: resolveAccountAvailability(base({ accountStatus: 'LOGIN_REQUIRED' })),
      },
    ]);
    expect(summary).toEqual({ ready: 1, busy: 1, paused: 1, needsAttention: 1 });
  });
});

describe('formatAvailabilityPreflightMessage', () => {
  it('returns login message instead of generic no worker', () => {
    const msg = formatAvailabilityPreflightMessage([
      {
        availability: resolveAccountAvailability(base({ accountStatus: 'LOGIN_REQUIRED' })),
      },
    ]);
    expect(msg).toBe('1 tài khoản cần đăng nhập lại.');
  });
});
