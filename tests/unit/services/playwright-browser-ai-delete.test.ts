import { describe, expect, it, vi, beforeEach } from 'vitest';

const releaseAccountResources = vi.fn(() => Promise.resolve(undefined));

vi.mock('../../../src/main/services/playwright-browser-ai-service-singleton', () => ({
  getPlaywrightBrowserAiService: () => ({
    releaseAccountResources,
  }),
}));

vi.mock('../../../src/main/automation/browser-runner/profile-manager', () => ({
  browserProfileManager: {
    deleteProfileDirectory: vi.fn(),
  },
}));

import { AiProviderService } from '../../../src/main/ai/ai-provider-service';

function createMockDb() {
  const account = {
    id: 'acc-1',
    provider_id: 'prov-chatgpt',
    profile_dir_name: 'ai-acc-1',
    session_location: '/tmp/profile',
  };
  const provider = { id: 'prov-chatgpt', type: 'PLAYWRIGHT_CHATGPT' };
  return {
    aiAccounts: {
      getById: vi.fn((id: string) => (id === 'acc-1' ? account : null)),
      delete: vi.fn(() => true),
    },
    aiProviders: {
      getById: vi.fn(() => provider),
    },
  };
}

describe('deleteBrowserAccount', () => {
  beforeEach(() => {
    releaseAccountResources.mockClear();
  });

  it('releases browser resources before deleting profile and row', async () => {
    const db = createMockDb();
    const service = new AiProviderService(db as never, {} as never, {} as never, {} as never);

    const result = await service.deleteBrowserAccount('acc-1');

    expect(releaseAccountResources).toHaveBeenCalledWith('acc-1');
    expect(db.aiAccounts.delete).toHaveBeenCalledWith('acc-1');
    expect(result).toEqual({ ok: true });
  });
});
