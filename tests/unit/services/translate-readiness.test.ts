import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslateReadinessService } from '@main/services/translate-readiness-service';
import type { DatabaseManager } from '@main/db/database-manager';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { mockAccountAvailability } from '../../helpers/account-availability-fixtures';

const mockResolve = vi.fn(() => mockAccountAvailability({ usableForNewJob: true }));
const mockPreflightMessage = vi.fn(() => null as string | null);

vi.mock('@main/services/account-availability-service', () => ({
  getAccountAvailabilityService: vi.fn(() => ({
    resolve: mockResolve,
    preflightMessage: mockPreflightMessage,
  })),
}));

vi.mock('@main/ai/provider-preflight', () => ({
  checkProviderForJob: vi.fn(() =>
    Promise.resolve({
      providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      result: 'READY',
      message: 'ok',
      checks: {},
    }),
  ),
}));

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ACCOUNT = '22222222-2222-2222-2222-222222222222';

function mockDb(opts: {
  accountStatus?: string;
  workerHealth?: string;
  aiReady?: boolean;
  notebookStatus?: string | null;
  enabledProviders?: string[];
}): DatabaseManager {
  const accountStatus = opts.accountStatus ?? 'READY';
  const workerHealth = opts.workerHealth ?? 'READY';
  const enabledProviders =
    opts.enabledProviders ??
    [
      {
        id: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        enabled: 1,
        priority: 1,
      },
    ];
  return {
    projects: {
      getById: (id: string) => (id === PROJECT ? { id } : null),
      getStyleConfig: () => null,
    },
    jobs: {
      getById: () => null,
      listByProject: () => [],
    },
    knowledgeSyncState: {
      getByProject: () => null,
      ensure: () => ({
        google_account_id: null,
        chapters_since_sync: 0,
        sync_every_n_chapters: 10,
        critical_change_pending: 0,
        version_probe_status: 'pending',
        pending_knowledge_version: 0,
        verified_knowledge_version: 0,
        pending_sync_nonce: null,
        verified_sync_nonce: null,
      }),
    },
    workerStates: {
      listAll: () => [
        {
          id: 'w1',
          google_account_id: ACCOUNT,
          health: workerHealth,
          current_job_id: null,
        },
      ],
      listEnabled: () => [
        {
          id: 'w1',
          google_account_id: ACCOUNT,
          health: workerHealth,
          current_job_id: null,
        },
      ],
      getById: () => null,
      getByAccountId: (id: string) =>
        id === ACCOUNT
          ? {
              id: 'w1',
              google_account_id: ACCOUNT,
              health: workerHealth,
              current_job_id: null,
            }
          : null,
      markReady: vi.fn(),
      clearExpiredLimits: vi.fn(),
    },
    googleAccounts: {
      getById: (id: string) =>
        id === ACCOUNT
          ? { id: ACCOUNT, status: accountStatus, email: 'a@x.com', display_name: 'A', label: 'A' }
          : null,
      getDetail: (id: string) =>
        id === ACCOUNT
          ? {
              id: ACCOUNT,
              status: accountStatus,
              email: 'a@x.com',
              display_name: 'A',
              label: 'A',
              worker_enabled: 1,
            }
          : null,
      getProfile: (id: string) =>
        id === ACCOUNT
          ? { profile_dir_name: 'profile-a' }
          : null,
      list: () => [{ id: ACCOUNT, status: accountStatus }],
      listDetails: () => [],
    },
    aiAccounts: {
      listAll: () =>
        opts.aiReady ? [{ id: 'ai1', status: 'READY' }] : [{ id: 'ai1', status: 'LOGIN_REQUIRED' }],
    },
    aiProviders: {
      listEnabledOrdered: () => enabledProviders,
    },
    notebooks: {
      getByProjectAndWorker: () =>
        opts.notebookStatus
          ? { status: opts.notebookStatus }
          : null,
      listByProject: () => [],
    },
  } as unknown as DatabaseManager;
}

describe('TranslateReadinessService.ensureForTranslate', () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockResolve.mockReturnValue(mockAccountAvailability({ usableForNewJob: true }));
    mockPreflightMessage.mockReset();
    mockPreflightMessage.mockReturnValue(null);
  });

  it('returns ok when Playwright provider is ready without Web API cookies', async () => {
    const prepareForTranslate = vi.fn(() =>
      Promise.resolve({
        ready: true,
        usedFallback: true,
        message: 'prepared',
        notebookStatus: null as string | null,
        needsAssisted: false,
      }),
    );
    const service = new TranslateReadinessService(mockDb({ aiReady: false }), {
      openBrowser: vi.fn(),
      testSession: vi.fn(() => Promise.resolve({ usable: true })),
      prepareForTranslate,
    });

    const result = await service.ensureForTranslate(PROJECT);

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('returns ok when Web API is ready after prepare', async () => {
    const openBrowser = vi.fn();
    const testSession = vi.fn();
    const prepareForTranslate = vi.fn(() =>
      Promise.resolve({
        ready: true,
        usedFallback: true,
        message: 'prepared',
        notebookStatus: null as string | null,
        needsAssisted: false,
      }),
    );
    const service = new TranslateReadinessService(mockDb({ aiReady: true }), {
      openBrowser,
      testSession,
      prepareForTranslate,
    });

    const result = await service.ensureForTranslate(PROJECT);

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.workerAccountId).toBe(ACCOUNT);
    expect(openBrowser).not.toHaveBeenCalled();
    expect(prepareForTranslate).toHaveBeenCalled();
  });

  it('opens Gemini and asks user when LOGIN_REQUIRED and session still unusable', async () => {
    mockResolve.mockReturnValue(
      mockAccountAvailability({
        availability: 'LOGIN_REQUIRED',
        usableForNewJob: false,
      }),
    );
    mockPreflightMessage.mockReturnValue('1 tài khoản cần đăng nhập lại.');
    const openBrowser = vi.fn(() => Promise.resolve());
    const testSession = vi.fn(() =>
      Promise.resolve({ usable: false, reason: 'LOGIN_REQUIRED' }),
    );
    const prepareForTranslate = vi.fn();
    const service = new TranslateReadinessService(
      mockDb({ accountStatus: 'LOGIN_REQUIRED', workerHealth: 'LOGIN_REQUIRED', aiReady: false }),
      { openBrowser, testSession, prepareForTranslate },
    );

    const result = await service.ensureForTranslate(PROJECT);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('needs_google_login');
    expect(result.actions).toContain('check_google');
    expect(openBrowser).toHaveBeenCalledWith(ACCOUNT, 'gemini');
    expect(testSession).toHaveBeenCalledWith(ACCOUNT);
    expect(prepareForTranslate).not.toHaveBeenCalled();
  });

  it('opens NotebookLM when no channel after prepare', async () => {
    const openBrowser = vi.fn(() => Promise.resolve());
    const prepareForTranslate = vi.fn(() =>
      Promise.resolve({
        ready: true,
        usedFallback: true,
        message: 'Notebook chưa sẵn sàng',
        notebookStatus: 'pending',
        needsAssisted: false,
      }),
    );
    const service = new TranslateReadinessService(
      mockDb({ aiReady: false, notebookStatus: null, enabledProviders: [] }),
      {
        openBrowser,
        testSession: vi.fn(() => Promise.resolve({ usable: true })),
        prepareForTranslate,
      },
    );

    const result = await service.ensureForTranslate(PROJECT);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('needs_notebook');
    expect(result.actions).toContain('open_notebook');
    expect(openBrowser).toHaveBeenCalledWith(ACCOUNT, 'notebook');
  });

  it('returns no_account when project has no Google accounts', async () => {
    mockPreflightMessage.mockReturnValue('Chưa có tài khoản Google.');
    const db = {
      projects: { getById: () => ({ id: PROJECT }) },
      jobs: { getById: () => null, listByProject: () => [] },
      knowledgeSyncState: {
        getByProject: () => null,
        ensure: () => ({
          google_account_id: null,
          chapters_since_sync: 0,
          sync_every_n_chapters: 10,
          critical_change_pending: 0,
          version_probe_status: 'pending',
          pending_knowledge_version: 0,
          verified_knowledge_version: 0,
          pending_sync_nonce: null,
          verified_sync_nonce: null,
        }),
      },
      workerStates: {
        listAll: () => [],
        listEnabled: () => [],
        getById: () => null,
        getByAccountId: () => null,
        markReady: vi.fn(),
        clearExpiredLimits: vi.fn(),
      },
      googleAccounts: {
        getById: () => null,
        getDetail: () => null,
        getProfile: () => null,
        list: () => [],
        listDetails: () => [],
      },
      aiAccounts: { listAll: () => [] },
      notebooks: { getByProjectAndWorker: () => null, listByProject: () => [] },
    } as unknown as DatabaseManager;
    const service = new TranslateReadinessService(db, {
      openBrowser: vi.fn(),
      prepareForTranslate: vi.fn(),
    });

    const result = await service.ensureForTranslate(PROJECT);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_account');
    expect(result.actions).toContain('check_google');
  });
});
