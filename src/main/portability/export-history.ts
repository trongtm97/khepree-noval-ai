import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';
import type { DatabaseManager } from '../db/database-manager';

export interface ExportHistoryEntry {
  id: string;
  projectId: string;
  editionId: string | null;
  chapterId: string | null;
  format: string;
  path: string;
  status: string;
  createdAt: string;
}

export function recordExportHistory(
  db: DatabaseManager,
  input: {
    projectId: string;
    editionId?: string | null;
    chapterId?: string | null;
    format: string;
    path: string;
    status?: string;
  },
): ExportHistoryEntry {
  const id = newId();
  const createdAt = utcNow();
  db.getConnection()
    .prepare(
      `INSERT INTO export_history (
        id, project_id, edition_id, chapter_id, format, path, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.editionId ?? null,
      input.chapterId ?? null,
      input.format,
      input.path,
      input.status ?? 'success',
      createdAt,
    );
  return {
    id,
    projectId: input.projectId,
    editionId: input.editionId ?? null,
    chapterId: input.chapterId ?? null,
    format: input.format,
    path: input.path,
    status: input.status ?? 'success',
    createdAt,
  };
}
