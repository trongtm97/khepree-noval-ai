import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { ProjectDocumentType, SourceFileClassification } from '@shared/constants/book-metadata';

export interface ProjectDocumentRow {
  id: string;
  project_id: string;
  document_type: ProjectDocumentType;
  title: string | null;
  source_file_path: string | null;
  source_file_name: string | null;
  source_text: string | null;
  content_hash: string | null;
  source_modified_at: string | null;
  classification: SourceFileClassification;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertProjectDocumentInput {
  project_id: string;
  document_type: ProjectDocumentType;
  title?: string | null;
  source_file_path?: string | null;
  source_file_name?: string | null;
  source_text?: string | null;
  content_hash?: string | null;
  source_modified_at?: string | null;
  classification?: SourceFileClassification;
  status?: string;
}

export class ProjectDocumentRepository extends BaseRepository {
  listByProject(projectId: string): ProjectDocumentRow[] {
    return this.db
      .prepare(
        `SELECT * FROM project_documents WHERE project_id = ? ORDER BY document_type ASC, created_at ASC`,
      )
      .all(projectId) as ProjectDocumentRow[];
  }

  getBySourcePath(projectId: string, sourceFilePath: string): ProjectDocumentRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM project_documents WHERE project_id = ? AND source_file_path = ? LIMIT 1`,
        )
        .get(projectId, sourceFilePath) as ProjectDocumentRow | undefined) ?? null
    );
  }

  upsert(input: UpsertProjectDocumentInput): ProjectDocumentRow {
    const existing = input.source_file_path
      ? this.getBySourcePath(input.project_id, input.source_file_path)
      : null;

    if (existing) {
      this.db
        .prepare(
          `UPDATE project_documents SET
            document_type = ?,
            title = ?,
            source_file_name = ?,
            source_text = ?,
            content_hash = ?,
            source_modified_at = ?,
            classification = ?,
            status = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.document_type,
          input.title ?? existing.title,
          input.source_file_name ?? existing.source_file_name,
          input.source_text ?? existing.source_text,
          input.content_hash ?? existing.content_hash,
          input.source_modified_at ?? existing.source_modified_at,
          input.classification ?? existing.classification,
          input.status ?? existing.status,
          utcNow(),
          existing.id,
        );
      return this.assertRow(this.getById(existing.id), 'project_document', existing.id);
    }

    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO project_documents (
          id, project_id, document_type, title, source_file_path, source_file_name,
          source_text, content_hash, source_modified_at, classification, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.document_type,
        input.title ?? null,
        input.source_file_path ?? null,
        input.source_file_name ?? null,
        input.source_text ?? null,
        input.content_hash ?? null,
        input.source_modified_at ?? null,
        input.classification ?? 'PROJECT_DOCUMENT',
        input.status ?? 'active',
        ts.created_at,
        ts.updated_at,
      );

    return this.assertRow(this.getById(id), 'project_document', id);
  }

  getById(id: string): ProjectDocumentRow | null {
    return (
      (this.db.prepare(`SELECT * FROM project_documents WHERE id = ?`).get(id) as
        | ProjectDocumentRow
        | undefined) ?? null
    );
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM project_documents WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}
