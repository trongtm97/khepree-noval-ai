import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0-test',
    isPackaged: true,
  },
}));

import { UpdateService } from '@main/updates/update-service';
import { DevAutoUpdaterPort } from '@main/updates/dev-auto-updater-port';

describe('UpdateService', () => {
  let autoUpdater: DevAutoUpdaterPort;
  let statuses: unknown[] = [];

  beforeEach(() => {
    autoUpdater = new DevAutoUpdaterPort();
    statuses = [];
    vi.stubEnv('KHEPREE_DEV_MOCK_UPDATE_VERSION', '9.9.9');
  });

  function createService(packaged = true) {
    return new UpdateService(
      autoUpdater,
      {
        fetchLatestUpdate: vi.fn().mockResolvedValue({
          update: {
            version: '1.2.0',
            mandatoryUpdate: false,
            releaseNotes: '<b>Notes</b><script>x</script>',
            artifacts: [],
          },
        }),
        requestSquirrelFeedTicket: vi.fn().mockResolvedValue({
          feedBaseUrl: 'https://api.khepree.com/feed?ft=secret-ticket',
          feedTicketExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        }),
      },
      () => Promise.resolve('access-token'),
      () => 'en',
      () => 0,
      (status) => {
        statuses.push(status);
      },
      packaged,
    );
  }

  it('transitions through checking to up-to-date when no newer version from API', async () => {
    const api = {
      fetchLatestUpdate: vi.fn().mockResolvedValue({ update: null }),
      requestSquirrelFeedTicket: vi.fn(),
    };
    const svc = new UpdateService(
      autoUpdater,
      api,
      () => Promise.resolve('token'),
      () => 'en',
      () => 0,
      (s) => statuses.push(s),
      true,
    );
    const result = await svc.checkNow('test');
    expect(result.phase).toBe('up-to-date');
  });

  it('single-flight blocks duplicate checks', async () => {
    let resolveApi: () => void = () => undefined;
    const api = {
      fetchLatestUpdate: vi.fn(
        () =>
          new Promise<{ update: null }>((resolve) => {
            resolveApi = () => { resolve({ update: null }); };
          }),
      ),
      requestSquirrelFeedTicket: vi.fn(),
    };
    const svc = new UpdateService(
      autoUpdater,
      api,
      () => Promise.resolve('token'),
      () => 'en',
      () => 0,
      () => undefined,
      true,
    );
    const first = svc.checkNow('a');
    await Promise.resolve();
    const second = svc.checkNow('b');
    resolveApi();
    await Promise.all([first, second]);
    expect(api.fetchLatestUpdate).toHaveBeenCalledTimes(1);
  });

  it('maps autoUpdater events to downloaded state', () => {
    const service = createService(true);
    service.initialize();
    autoUpdater.simulateAvailable('2.0.0', 'Release');
    autoUpdater.simulateDownloaded('2.0.0', 'Release');
    expect(service.getStatus().phase).toBe('downloaded');
    expect(service.getStatus().releaseNotes).not.toContain('<script');
  });

  it('blocks install when jobs running', async () => {
    const service = new UpdateService(
      autoUpdater,
      {
        fetchLatestUpdate: vi.fn(),
        requestSquirrelFeedTicket: vi.fn(),
      },
      () => Promise.resolve('token'),
      () => 'en',
      () => 2,
      () => undefined,
      true,
    );
    service.initialize();
    autoUpdater.simulateDownloaded('2.0.0');
    const result = await service.installAndRestart();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('jobs_running');
  });

  it('redacts feed ticket from error messages', () => {
    const service = createService(true);
    service.initialize();
    autoUpdater.simulateError('failed https://api.khepree.com/feed?ft=secret-ticket');
    expect(service.getStatus().errorMessage).not.toContain('secret-ticket');
  });

  it('reports unavailable when not packaged', async () => {
    const service = createService(false);
    const status = await service.checkNow('dev');
    expect(status.phase).toBe('unavailable');
  });
});
