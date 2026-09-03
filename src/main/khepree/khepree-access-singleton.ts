import { getSecretStorage } from '../security';
import { getDatabase } from '../db/connection';
import { KhepreeAccessService } from './khepree-access-service';
import { KhepreeHeartbeatService } from './heartbeat-service';
import { broadcastKhepreeAccessState } from './access-state-bridge';
import { setKhepreeProductAccessEnforcer } from './product-access-boundary';
import { lockProtectedJobsOnKhepreeRevocation } from './licensing-job-guard';
import { triggerAnnouncementSync } from './announcement-sync-singleton';
import { logger } from '../logging/logger';
import { assertPackagedSigningKeyConfigured } from './config';

let accessService: KhepreeAccessService | null = null;
let heartbeatService: KhepreeHeartbeatService | null = null;
let heartbeatRunning = false;

export function initializeKhepreeAccessService(): KhepreeAccessService {
  if (accessService) return accessService;
  accessService = new KhepreeAccessService(() => getDatabase(), getSecretStorage());
  const service = accessService;
  setKhepreeProductAccessEnforcer((feature) => {
    service.assertProductAccess(feature);
  });
  accessService.setRuntimeRevocationHandler((reason) => {
    lockProtectedJobsOnKhepreeRevocation(reason);
  });
  accessService.subscribe((state) => {
    broadcastKhepreeAccessState(state);
    if (state.signedIn) {
      triggerAnnouncementSync('access-state');
    }
    const wantHeartbeat = state.status === 'ACTIVE' && state.canUseWorkspace;
    if (wantHeartbeat) {
      if (!heartbeatRunning) {
        heartbeatService?.start();
        heartbeatRunning = true;
      }
    } else if (heartbeatRunning) {
      heartbeatService?.stop();
      heartbeatRunning = false;
    }
  });
  heartbeatService = new KhepreeHeartbeatService(accessService);
  return accessService;
}

export function getKhepreeAccessService(): KhepreeAccessService {
  if (!accessService) {
    throw new Error('KhepreeAccessService not initialized');
  }
  return accessService;
}

export async function startupKhepreeAccess(): Promise<void> {
  assertPackagedSigningKeyConfigured();
  const service = initializeKhepreeAccessService();
  const state = await service.initializeOnColdStart();
  logger.info('Khepree access cold start', { status: state.status, signedIn: state.signedIn });
  if (state.status === 'ACTIVE' && state.canUseWorkspace) {
    heartbeatService?.start();
    heartbeatRunning = true;
  }
}

export function restartKhepreeHeartbeat(): void {
  heartbeatService?.restart();
  heartbeatRunning = heartbeatService != null;
}

export function triggerKhepreeHeartbeatNow(): void {
  heartbeatService?.triggerNow();
}

export async function shutdownKhepreeAccess(): Promise<void> {
  heartbeatService?.stop();
  heartbeatRunning = false;
  await accessService?.shutdown();
}

export function resetKhepreeAccessForTests(): void {
  heartbeatService?.stop();
  heartbeatRunning = false;
  heartbeatService = null;
  accessService?.setRuntimeRevocationHandler(null);
  accessService = null;
  setKhepreeProductAccessEnforcer(null);
}
