import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const getProfileMock = vi.fn();
const healthCheckDeps = {
  profileExists: vi.fn(() => true),
  resolveProfilePath: vi.fn((name: string) => `C:/profiles/${name}`),
  recoverIfStale: vi.fn(),
  isLocked: vi.fn(() => false),
  getOwner: vi.fn(() => null as string | null),
  assess: vi.fn(() => ({ browserUsable: true, message: 'ok' })),
  closeBrowser: vi.fn(async () => ({})),
};

vi.mock('@main/db/connection', () => ({
  getDatabase: () => ({
    googleAccounts: {
      list: listMock,
      getProfile: getProfileMock,
    },
  }),
}));

vi.mock('@main/automation/browser-runner/profile-manager', () => ({
  browserProfileManager: {
    profileExists: (...args: unknown[]) => healthCheckDeps.profileExists(...args),
    resolveProfilePath: (...args: unknown[]) =>
      healthCheckDeps.resolveProfilePath(...(args as [string])),
  },
}));

vi.mock('@main/automation/browser-runner/profile-lock', () => ({
  profileLockManager: {
    recoverIfStale: (...args: unknown[]) => healthCheckDeps.recoverIfStale(...args),
    isLocked: (...args: unknown[]) => healthCheckDeps.isLocked(...args),
    getOwner: (...args: unknown[]) => healthCheckDeps.getOwner(...args),
  },
}));

vi.mock('@main/automation/browser-runner/browser-dependency-health', () => ({
  assessBrowserDependencyHealth: () => healthCheckDeps.assess(),
}));

vi.mock('@main/services/account-worker-singleton', () => ({
  getAccountWorkerService: () => ({
    closeBrowser: healthCheckDeps.closeBrowser,
  }),
}));

import { PlaywrightGeminiAdapter } from '@main/ai/adapters/playwright-gemini-adapter';

describe('PlaywrightGeminiAdapter.healthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthCheckDeps.profileExists.mockReturnValue(true);
    healthCheckDeps.isLocked.mockReturnValue(false);
    healthCheckDeps.getOwner.mockReturnValue(null);
    healthCheckDeps.assess.mockReturnValue({ browserUsable: true, message: 'ok' });
  });

  it('returns READY when Google account + profile + browser ok', async () => {
    listMock.mockReturnValue([{ id: 'acc-1', status: 'READY', email: 'a@b.c' }]);
    getProfileMock.mockReturnValue({ profile_dir_name: 'p1' });

    const adapter = new PlaywrightGeminiAdapter({
      sendTranslation: vi.fn(),
      cancelActive: vi.fn(),
    } as never);

    const health = await adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.status).toBe('READY');
    expect(health.message).not.toMatch(/checkProviderForJob/);
  });

  it('returns LOGIN_REQUIRED when no usable Google account', async () => {
    listMock.mockReturnValue([{ id: 'acc-1', status: 'LOGIN_REQUIRED', email: 'a@b.c' }]);
    getProfileMock.mockReturnValue(null);

    const adapter = new PlaywrightGeminiAdapter({
      sendTranslation: vi.fn(),
      cancelActive: vi.fn(),
    } as never);

    const health = await adapter.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.status).toBe('LOGIN_REQUIRED');
  });

  it('closes manual Accounts browser lock then READY', async () => {
    listMock.mockReturnValue([{ id: 'acc-1', status: 'READY', email: 'a@b.c' }]);
    getProfileMock.mockReturnValue({ profile_dir_name: 'p1' });
    healthCheckDeps.isLocked.mockReturnValueOnce(true).mockReturnValueOnce(false);
    healthCheckDeps.getOwner.mockReturnValue('acc-1');

    const adapter = new PlaywrightGeminiAdapter({
      sendTranslation: vi.fn(),
      cancelActive: vi.fn(),
    } as never);

    const health = await adapter.healthCheck();
    expect(healthCheckDeps.closeBrowser).toHaveBeenCalledWith('acc-1');
    expect(health.ok).toBe(true);
    expect(health.status).toBe('READY');
  });
});
