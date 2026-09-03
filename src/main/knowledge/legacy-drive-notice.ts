import type { DatabaseManager } from '../db/database-manager';
import { LEGACY_BINDING_DRIVE_LIVE } from './legacy-db-values';

/** True when project still has legacy Google Drive artifacts in SQLite (non-destructive). */
export function projectHasLegacyDriveArtifacts(
  db: DatabaseManager,
  projectId: string,
): boolean {
  if (db.knowledgeSyncState.hasLegacyDriveRootFolder(projectId)) return true;

  if (db.hasLegacyDriveResourceRows(projectId)) return true;

  if (db.knowledgeFiles.listByProject(projectId).some((row) => row.drive_file_id)) {
    return true;
  }

  return db.notebookSourceBindings
    .listByProject(projectId)
    .some((row) => row.binding_type === LEGACY_BINDING_DRIVE_LIVE);
}
