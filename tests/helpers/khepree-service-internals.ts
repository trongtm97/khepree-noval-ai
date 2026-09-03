import type { KhepreeAccessService } from '@main/khepree/khepree-access-service';
import type { KhepreeSessionStore } from '@main/khepree/session-store';
import type { DeviceIdentityService } from '@main/khepree/device-identity-service';
import type { KhepreeApiClient } from '@main/khepree/khepree-api-client';
import type { KhepreeSignedLease } from '@shared/schemas/khepree';

/** Test-only access to private KhepreeAccessService fields (no production use). */
export interface KhepreeAccessServiceInternals {
  sessionStore: KhepreeSessionStore;
  deviceIdentity: DeviceIdentityService;
  api: KhepreeApiClient;
  currentLease: KhepreeSignedLease | null;
}

export function khepreeAccessInternals(
  service: KhepreeAccessService,
): KhepreeAccessServiceInternals {
  return service as unknown as KhepreeAccessServiceInternals;
}
