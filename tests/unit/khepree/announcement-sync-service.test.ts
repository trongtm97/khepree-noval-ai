import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0-test',
    isPackaged: false,
  },
}));

import {
  DesktopAnnouncementsResponseSchema,
  DesktopAnnouncementItemSchema,
} from '@shared/schemas/khepree-announcements';
import { AnnouncementSyncService } from '@main/khepree/announcement-sync-service';
import { AnnouncementCacheStore } from '@main/khepree/announcement-cache-store';

function makeItem(publicId: string): ReturnType<typeof DesktopAnnouncementItemSchema.parse> {
  return DesktopAnnouncementItemSchema.parse({
    publicId,
    severity: 'info',
    title: `Title ${publicId}`,
    body: 'Body',
    publishedAt: new Date().toISOString(),
    expiresAt: null,
    cta: { kind: 'none', payload: null },
    readAt: null,
    dismissedAt: null,
  });
}

describe('AnnouncementSyncService', () => {
  const meta = new Map<string, string>();
  const db = {
    appMeta: {
      get: (key: string) => meta.get(key) ?? null,
      set: (key: string, value: string) => {
        meta.set(key, value);
      },
      delete: (key: string) => {
        meta.delete(key);
      },
    },
  };

  beforeEach(() => {
    meta.clear();
  });

  it('validates API payload with zod', () => {
    expect(() =>
      DesktopAnnouncementsResponseSchema.parse({ items: [{ publicId: 'x' }] }),
    ).toThrow();
  });

  it('paginates with cursor', async () => {
    const api = {
      listAnnouncements: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeItem('a1')],
          nextCursor: '1',
        })
        .mockResolvedValueOnce({
          items: [makeItem('a2')],
          nextCursor: null,
        }),
      markAnnouncementRead: vi.fn(),
      dismissAnnouncement: vi.fn(),
    };
    const service = new AnnouncementSyncService(
      api as never,
      new AnnouncementCacheStore(() => db as never),
      () => Promise.resolve('token'),
      () => 'en',
    );
    await service.sync('test');
    expect(api.listAnnouncements).toHaveBeenCalledTimes(2);
    const listed = service.listForRenderer();
    expect(listed.items.map((i) => i.publicId).sort()).toEqual(['a1', 'a2']);
  });

  it('single-flight prevents parallel sync', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = {
      listAnnouncements: vi.fn(() =>
        gate.then(() => ({ items: [], nextCursor: null })),
      ),
      markAnnouncementRead: vi.fn(),
      dismissAnnouncement: vi.fn(),
    };
    const service = new AnnouncementSyncService(
      api as never,
      new AnnouncementCacheStore(() => db as never),
      () => Promise.resolve('token'),
      () => 'vi',
    );
    const first = service.sync('one');
    const second = service.sync('two');
    release();
    await Promise.all([first, second]);
    expect(api.listAnnouncements).toHaveBeenCalledTimes(1);
  });

  it('queues read receipt and retries on next sync', async () => {
    const api = {
      listAnnouncements: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      markAnnouncementRead: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ publicId: 'x', readAt: new Date().toISOString() }),
      dismissAnnouncement: vi.fn(),
    };
    const cache = new AnnouncementCacheStore(() => db as never);
    cache.upsertMany([makeItem('x')]);
    const service = new AnnouncementSyncService(
      api as never,
      cache,
      () => Promise.resolve('token'),
      () => 'en',
    );
    service.markReadLocal('x');
    await service.sync('read');
    await service.sync('read-retry');
    expect(api.markAnnouncementRead).toHaveBeenCalledTimes(2);
  });
});
