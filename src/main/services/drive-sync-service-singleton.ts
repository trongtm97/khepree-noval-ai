import { getDatabase } from '../db/connection';
import { getSecretStorage } from '../security';
import { DriveOAuthService } from '../drive/drive-oauth-service';
import { DriveSyncService } from '../drive/drive-sync-service';
import { setNotebookDriveSyncFn } from '../notebook/notebook-sync-service-singleton';

let instance: DriveSyncService | null = null;

export function initializeDriveSyncService(): DriveSyncService {
  const db = getDatabase();
  instance = new DriveSyncService(
    db,
    db.googleAccounts,
    new DriveOAuthService(getSecretStorage()),
  );
  setNotebookDriveSyncFn((projectId) => instance!.syncProject(projectId));
  return instance;
}

export function getDriveSyncService(): DriveSyncService {
  if (!instance) {
    return initializeDriveSyncService();
  }
  return instance;
}

export function resetDriveSyncServiceForTests(): void {
  instance = null;
  setNotebookDriveSyncFn(undefined);
}
