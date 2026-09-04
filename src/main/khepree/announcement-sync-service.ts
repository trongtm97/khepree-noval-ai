import { logger } from '../logging/logger';
import { KhepreeNetworkError } from './errors';
import type { KhepreeApiClient } from './khepree-api-client';
import { AnnouncementCacheStore } from './announcement-cache-store';
import {
  mapAnnouncementSeverityToKind,
  resolveSafeAnnouncementCta,
} from './announcement-cta-policy';
import {
  getDesktopAppVersion,
  getDesktopArchitecture,
  getDesktopReleaseChannel,
  getDesktopReleasePlatform,
} from './desktop-runtime-context';
import { getKhepreeOAuthClientId } from './config';
import type {
  KhepreeAnnouncementDto,
  KhepreeAnnouncementsListResponse,
} from '@shared/schemas/khepree-announcements';

export type AnnouncementAccessTokenProvider = () => Promise<string | null>;
export type AnnouncementLocaleProvider = () => string;

export class AnnouncementSyncService {
  private syncInFlight: Promise<void> | null = null;
  private syncStatus: KhepreeAnnouncementsListResponse['syncStatus'] = 'idle';
  private syncError: string | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: KhepreeApiClient,
    private readonly cache: AnnouncementCacheStore,
    private readonly getAccessToken: AnnouncementAccessTokenProvider,
    private readonly getLocale: AnnouncementLocaleProvider,
  ) {}

  startPeriodicSync(intervalMs: number): void {
    this.stopPeriodicSync();
    this.periodicTimer = setInterval(() => {
      void this.sync('periodic');
    }, intervalMs);
  }

  stopPeriodicSync(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  /** Single-flight sync from Khepree API with local cache upsert. */
  async sync(source: string): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }
    this.syncInFlight = this.runSync(source).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  private async runSync(source: string): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      this.syncStatus = 'offline';
      this.syncError = null;
      logger.debug('Announcement sync skipped — no access token', { source });
      return;
    }

    this.syncStatus = 'syncing';
    this.syncError = null;

    try {
      await this.flushPendingReceipts(token);
      await this.fetchAllPages(token);
      this.cache.setLastSyncedAt(new Date().toISOString());
      this.syncStatus = 'idle';
      this.syncError = null;
      logger.info('Announcement sync completed', { source });
    } catch (error) {
      if (error instanceof KhepreeNetworkError) {
        this.syncStatus = 'offline';
        this.syncError = 'network';
      } else {
        this.syncStatus = 'error';
        this.syncError = error instanceof Error ? error.message : 'sync_failed';
      }
      logger.warn('Announcement sync failed', {
        source,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async fetchAllPages(accessToken: string): Promise<void> {
    let cursor: string | null | undefined = undefined;
    const collected: Awaited<ReturnType<KhepreeApiClient['listAnnouncements']>>['items'] = [];

    do {
      const page = await this.api.listAnnouncements({
        accessToken,
        clientId: getKhepreeOAuthClientId(),
        appVersion: getDesktopAppVersion(),
        platform: getDesktopReleasePlatform(),
        architecture: getDesktopArchitecture(),
        channel: getDesktopReleaseChannel(),
        locale: this.getLocale(),
        cursor,
        limit: 50,
      });
      collected.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    if (collected.length > 0) {
      this.cache.upsertMany(collected);
    }
  }

  private async flushPendingReceipts(accessToken: string): Promise<void> {
    for (const publicId of this.cache.readPendingReads()) {
      try {
        const result = await this.api.markAnnouncementRead({ accessToken, publicId });
        this.cache.markReadLocal(publicId, result.readAt);
        this.cache.dequeueReadReceipt(publicId);
      } catch (error) {
        logger.debug('Announcement read receipt retry deferred', {
          publicId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const publicId of this.cache.readPendingDismisses()) {
      try {
        const result = await this.api.dismissAnnouncement({ accessToken, publicId });
        this.cache.markDismissedLocal(publicId, result.dismissedAt, result.readAt);
        this.cache.dequeueDismissReceipt(publicId);
      } catch (error) {
        logger.debug('Announcement dismiss receipt retry deferred', {
          publicId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  listForRenderer(): KhepreeAnnouncementsListResponse {
    const now = Date.now();
    const items: KhepreeAnnouncementDto[] = this.cache
      .listCached()
      .filter((item) => !item.dismissedAt)
      .map((item) => {
        const expired = item.expiresAt != null && Date.parse(item.expiresAt) < now;
        const cta = resolveSafeAnnouncementCta(item.cta);
        return {
          publicId: item.publicId,
          kind: mapAnnouncementSeverityToKind(item.severity),
          type: 'general' as const,
          title: item.title,
          description: item.body ?? '',
          publishedAt: item.publishedAt,
          expiresAt: item.expiresAt,
          read: item.readAt != null,
          dismissed: item.dismissedAt != null,
          expired,
          cta,
        };
      })
      .filter((item) => !item.expired);

    return {
      items,
      lastSyncedAt: this.cache.getLastSyncedAt(),
      syncStatus: this.syncStatus,
      syncError: this.syncError,
    };
  }

  markReadLocal(publicId: string): void {
    const readAt = new Date().toISOString();
    this.cache.markReadLocal(publicId, readAt);
    this.cache.queueReadReceipt(publicId);
    void this.sync('read-receipt');
  }

  dismissLocal(publicId: string): void {
    const dismissedAt = new Date().toISOString();
    this.cache.markDismissedLocal(publicId, dismissedAt, dismissedAt);
    this.cache.queueDismissReceipt(publicId);
    void this.sync('dismiss-receipt');
  }
}
