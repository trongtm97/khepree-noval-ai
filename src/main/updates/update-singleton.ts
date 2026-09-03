import { app, BrowserWindow } from 'electron';
import { getDatabase } from '../db/connection';
import { createKhepreeApiClient } from '../khepree/khepree-api-client';
import { getKhepreeAccessService } from '../khepree/khepree-access-singleton';
import { getKhepreeApiBaseUrl, isKhepreeDevMockEnabled } from '../khepree/config';
import { getJobService } from '../services/job-service-singleton';
import { UpdateService } from './update-service';
import { createDevAutoUpdaterPort } from './dev-auto-updater-port';
import { createElectronAutoUpdaterPort } from './electron-auto-updater-port';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { UpdateStatus } from '@shared/schemas/updates';
import { logger } from '../logging/logger';

let updateService: UpdateService | null = null;

function readUiLocale(): string {
  const raw = getDatabase().appMeta.get('ui.language');
  return raw === 'vi' || raw === 'en' ? raw : 'vi';
}

function broadcastUpdateStatus(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status);
    }
  }
}

export function initializeUpdateService(): UpdateService {
  if (updateService) return updateService;
  const api = createKhepreeApiClient(getKhepreeApiBaseUrl(), isKhepreeDevMockEnabled());
  const packaged = app.isPackaged;
  const autoUpdater = packaged ? createElectronAutoUpdaterPort() : createDevAutoUpdaterPort();
  updateService = new UpdateService(
    autoUpdater,
    api,
    () => getKhepreeAccessService().getAccessTokenForApi(),
    readUiLocale,
    () => getJobService().schedulerStatus().inFlight,
    broadcastUpdateStatus,
    packaged,
  );
  return updateService;
}

export function getUpdateService(): UpdateService {
  if (!updateService) {
    throw new Error('UpdateService not initialized');
  }
  return updateService;
}

export function startupUpdateService(): void {
  initializeUpdateService().initialize();
  app.on('before-quit-for-update' as Parameters<typeof app.on>[0], () => {
    getUpdateService().handleBeforeQuitForUpdate();
  });
  logger.info('UpdateService initialized', { packaged: app.isPackaged });
}

export function triggerUpdateCheckOnResume(): void {
  updateService?.onResume();
}

export function shutdownUpdateService(): void {
  updateService?.shutdown();
}

export function resetUpdateServiceForTests(): void {
  updateService?.shutdown();
  updateService = null;
}
