import { getSecretStorage } from '../security';
import { getDatabase } from '../db/connection';
import { KhepreeAccessService } from './khepree-access-service';
import { KhepreeHeartbeatService } from './heartbeat-service';
import { broadcastKhepreeAccessState } from './access-state-bridge';
import { setKhepreeProductAccessEnforcer } from './product-access-boundary';
import { lockProtectedJobsOnKhepreeRevocation } from './licensing-job-guard';
import { logger } from '../logging/logger';

let accessService: KhepreeAccessService | null = null;
let heartbeatService: KhepreeHeartbeatService | null = null;

export function initializeKhepreeAccessService(): KhepreeAccessService {
  if (accessService) return accessService;
  accessService = new KhepreeAccessService(() => getDatabase(), getSecretStorage());
  setKhepreeProductAccessEnforcer((feature) => {
    accessService!.assertProductAccess(feature);
  });
  accessService.setRuntimeRevocationHandler((reason) => {
    lockProtectedJobsOnKhepreeRevocation(reason);
  });
  accessService.subscribe((state) => {
    broadcastKhepreeAccessState(state);
    if (state.status === 'ACTIVE' && state.canUseWorkspace) {
      heartbeatService?.start();
    } else if (state.status !== 'ACTIVE') {
      heartbeatService?.stop();
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
  const service = initializeKhepreeAccessService();
  const state = await service.initializeOnColdStart();
  logger.info('Khepree access cold start', { status: state.status, signedIn: state.signedIn });
  if (state.status === 'ACTIVE') {
    heartbeatService?.start();
  }
}

export function restartKhepreeHeartbeat(): void {
  heartbeatService?.restart();
}

export function triggerKhepreeHeartbeatNow(): void {
  heartbeatService?.triggerNow();
}

export async function shutdownKhepreeAccess(): Promise<void> {
  heartbeatService?.stop();
  await accessService?.shutdown();
}

export function resetKhepreeAccessForTests(): void {
  heartbeatService?.stop();
  heartbeatService = null;
  accessService?.setRuntimeRevocationHandler(null);
  accessService = null;
  setKhepreeProductAccessEnforcer(null);
}
