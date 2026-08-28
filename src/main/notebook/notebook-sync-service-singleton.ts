import { getDatabase } from '../db/connection';
import type { DatabaseManager } from '../db/database-manager';
import { NotebookSyncService } from './notebook-sync-service';

let singleton: NotebookSyncService | null = null;

export function getNotebookSyncService(db?: DatabaseManager): NotebookSyncService {
  if (db && singleton) {
    const held = (singleton as unknown as { db: DatabaseManager }).db;
    if (held !== db) {
      singleton = null;
    }
  }
  singleton ??= new NotebookSyncService(db ?? getDatabase());
  return singleton;
}

export function resetNotebookSyncService(): void {
  singleton = null;
}
