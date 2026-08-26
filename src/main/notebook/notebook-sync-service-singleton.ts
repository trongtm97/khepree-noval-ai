import { getDatabase } from '../db/connection';
import type { DatabaseManager } from '../db/database-manager';
import { NotebookSyncService } from './notebook-sync-service';

let singleton: NotebookSyncService | null = null;
let driveSyncFn: ((projectId: string) => Promise<unknown>) | undefined;

export function setNotebookDriveSyncFn(
  fn: ((projectId: string) => Promise<unknown>) | undefined,
): void {
  driveSyncFn = fn;
  singleton = null;
}

export function getNotebookSyncService(db?: DatabaseManager): NotebookSyncService {
  singleton ??= new NotebookSyncService(db ?? getDatabase(), driveSyncFn);
  return singleton;
}

export function resetNotebookSyncService(): void {
  singleton = null;
}
