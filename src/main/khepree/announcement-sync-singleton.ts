import { getDatabase } from '../db/connection';
import { createKhepreeApiClient } from './khepree-api-client';
import { getKhepreeApiBaseUrl, isKhepreeDevMockEnabled } from './config';
import { AnnouncementCacheStore } from './announcement-cache-store';
import { AnnouncementSyncService } from './announcement-sync-service';
import { getKhepreeAccessService } from './khepree-access-singleton';
import { KHEPREE_ANNOUNCEMENT_SYNC_INTERVAL_MS } from '@shared/constants/khepree';
import { logger } from '../logging/logger';

let syncService: AnnouncementSyncService | null = null;

function readUiLocale(): string {
  const raw = getDatabase().appMeta.get('ui.language');
  return raw === 'vi' || raw === 'en' ? raw : 'vi';
}

export function initializeAnnouncementSyncService(): AnnouncementSyncService {
  if (syncService) return syncService;
  const api = createKhepreeApiClient(getKhepreeApiBaseUrl(), isKhepreeDevMockEnabled());
  const cache = new AnnouncementCacheStore(() => getDatabase());
  syncService = new AnnouncementSyncService(
    api,
    cache,
    () => getKhepreeAccessService().getAccessTokenForApi(),
    readUiLocale,
  );
  return syncService;
}

export function getAnnouncementSyncService(): AnnouncementSyncService {
  if (!syncService) {
    throw new Error('AnnouncementSyncService not initialized');
  }
  return syncService;
}

export function startupAnnouncementSync(): void {
  const service = initializeAnnouncementSyncService();
  service.startPeriodicSync(KHEPREE_ANNOUNCEMENT_SYNC_INTERVAL_MS);
  void service.sync('startup').catch((error: unknown) => {
    logger.debug('Initial announcement sync failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export function triggerAnnouncementSync(source: string): void {
  if (!syncService) return;
  void syncService.sync(source);
}

export function shutdownAnnouncementSync(): void {
  syncService?.stopPeriodicSync();
}

export function resetAnnouncementSyncForTests(): void {
  syncService?.stopPeriodicSync();
  syncService = null;
}
