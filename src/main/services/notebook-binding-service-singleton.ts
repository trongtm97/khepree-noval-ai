import { NotebookBindingService } from './notebook-binding-service';
import { getDatabase } from '../db/connection';
import type { DatabaseManager } from '../db/database-manager';

let instance: NotebookBindingService | null = null;

/**
 * Optional `db` keeps tests / campaign handlers on the live connection.
 * If a different DatabaseManager is passed, the singleton is replaced.
 */
export function getNotebookBindingService(db?: DatabaseManager): NotebookBindingService {
  if (db && instance) {
    const held = (instance as unknown as { db: DatabaseManager }).db;
    if (held !== db) {
      instance = null;
    }
  }
  instance ??= new NotebookBindingService(db ?? getDatabase());
  return instance;
}

export function resetNotebookBindingServiceForTests(): void {
  instance?.clearCreateLocksForTests();
  instance = null;
}
