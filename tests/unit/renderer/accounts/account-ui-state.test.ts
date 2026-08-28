import { describe, expect, it } from 'vitest';
import type { GoogleAccountDto } from '../../../../src/shared/schemas/account';
import {
  resolveAccountUiState,
  computeAccountSummary,
  sortAccounts,
  matchesAccountFilter,
  resolveAccountIdentity,
  planLabelKey,
} from '../../../../src/renderer/features/accounts/account-ui-state';
import { mockAccountAvailability } from '../../../helpers/account-availability-fixtures';

function makeAccount(overrides: Partial<GoogleAccountDto> = {}): GoogleAccountDto {
  const availability = overrides.availability ?? mockAccountAvailability();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@gmail.com',
    displayName: 'user@gmail.com',
    label: 'Google Account 11111111',
    avatarUrl: null,
    plan: 'PRO',
    status: 'READY',
    browserProfilePath: 'C:\\profiles\\test',
    lastSeenAt: null,
    lastUsedAt: '2026-08-28T17:50:00.000Z',
    notes: null,
    workerEnabled: true,
    assignedProjectIds: [],
    assignedProjects: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    profileLease: null,
    availability,
    ...overrides,
  };
}

describe('resolveAccountUiState', () => {
  it('reads uiLane from canonical availability DTO', () => {
    expect(
      resolveAccountUiState(
        makeAccount({ availability: mockAccountAvailability({ availability: 'READY', uiLane: 'ready' }) }),
      ),
    ).toBe('ready');
    expect(
      resolveAccountUiState(
        makeAccount({ availability: mockAccountAvailability({ availability: 'PAUSED', uiLane: 'paused' }) }),
      ),
    ).toBe('paused');
  });
});

describe('computeAccountSummary', () => {
  it('uses availability from DTO', () => {
    const accounts = [
      makeAccount({
        id: 'a1',
        availability: mockAccountAvailability({ availability: 'READY' }),
      }),
      makeAccount({
        id: 'a2',
        availability: mockAccountAvailability({ availability: 'BUSY', uiLane: 'running' }),
      }),
      makeAccount({
        id: 'a3',
        availability: mockAccountAvailability({ availability: 'PAUSED', uiLane: 'paused' }),
      }),
      makeAccount({
        id: 'a4',
        availability: mockAccountAvailability({ availability: 'LOGIN_REQUIRED', uiLane: 'login' }),
      }),
    ];
    expect(computeAccountSummary(accounts)).toEqual({
      ready: 1,
      busy: 1,
      paused: 1,
      needsAttention: 1,
    });
  });
});

describe('sortAccounts', () => {
  it('surfaces problems first, then by last used', () => {
    const accounts = [
      makeAccount({
        id: 'ready-old',
        lastUsedAt: '2026-08-01T00:00:00.000Z',
        availability: mockAccountAvailability({ availability: 'READY' }),
      }),
      makeAccount({
        id: 'login',
        lastUsedAt: '2026-08-27T00:00:00.000Z',
        availability: mockAccountAvailability({ availability: 'LOGIN_REQUIRED', uiLane: 'login' }),
      }),
      makeAccount({
        id: 'ready-new',
        lastUsedAt: '2026-08-28T00:00:00.000Z',
        availability: mockAccountAvailability({ availability: 'READY' }),
      }),
    ];
    const sorted = sortAccounts(accounts);
    expect(sorted.map((a) => a.id)).toEqual(['login', 'ready-new', 'ready-old']);
  });
});

describe('matchesAccountFilter', () => {
  it('filters by uiLane from availability', () => {
    const account = makeAccount({
      email: 'alpha@gmail.com',
      label: 'Alpha',
      availability: mockAccountAvailability({ availability: 'READY', uiLane: 'ready' }),
    });
    expect(matchesAccountFilter(account, 'ready', '')).toBe(true);
    expect(matchesAccountFilter(account, 'paused', '')).toBe(false);
    expect(matchesAccountFilter(account, 'all', 'alpha')).toBe(true);
  });
});

describe('resolveAccountIdentity', () => {
  it('uses custom label when user renamed', () => {
    const result = resolveAccountIdentity(
      makeAccount({ label: 'Cá nhân', displayName: 'user@gmail.com', email: 'user@gmail.com' }),
      'Fallback',
    );
    expect(result).toEqual({ title: 'Cá nhân', subtitle: 'user@gmail.com' });
  });
});

describe('planLabelKey', () => {
  it('maps plans to i18n keys', () => {
    expect(planLabelKey('UNKNOWN')).toBe('accounts.planUnknown');
    expect(planLabelKey('PRO')).toBe('accounts.planPro');
  });
});
