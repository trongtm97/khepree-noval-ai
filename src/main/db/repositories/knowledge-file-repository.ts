import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { KnowledgeType } from '@shared/constants/knowledge';

export interface KnowledgeFileRow {
  id: string;
  project_id: string;
  knowledge_type: string;
  content_hash: string | null;
  local_version: number;
  remote_version: number;
  dirty: number;
  last_generated_at: string | null;
  last_drive_sync_at: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export class KnowledgeFileRepository extends BaseRepository {
  get(projectId: string, knowledgeType: KnowledgeType): KnowledgeFileRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM knowledge_files WHERE project_id = ? AND knowledge_type = ?`,
        )
        .get(projectId, knowledgeType) as KnowledgeFileRow | undefined) ?? null
    );
  }

  listByProject(projectId: string): KnowledgeFileRow[] {
    return this.db
      .prepare(
        `SELECT * FROM knowledge_files WHERE project_id = ? ORDER BY knowledge_type ASC`,
      )
      .all(projectId) as KnowledgeFileRow[];
  }

  ensure(projectId: string, knowledgeType: KnowledgeType): KnowledgeFileRow {
    const existing = this.get(projectId, knowledgeType);
    if (existing) return existing;
    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO knowledge_files (
          id, project_id, knowledge_type, content_hash, local_version, remote_version,
          dirty, last_generated_at, last_drive_sync_at, last_verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 0, 0, 1, NULL, NULL, NULL, ?, ?)`,
      )
      .run(id, projectId, knowledgeType, ts.created_at, ts.updated_at);
    return this.assertRow(this.get(projectId, knowledgeType), 'knowledge_file', id);
  }

  markDirty(projectId: string, knowledgeType: KnowledgeType): KnowledgeFileRow {
    const row = this.ensure(projectId, knowledgeType);
    this.db
      .prepare(
        `UPDATE knowledge_files SET dirty = 1, local_version = local_version + 1, updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), row.id);
    return this.assertRow(this.get(projectId, knowledgeType), 'knowledge_file', row.id);
  }

  markAllDirty(projectId: string, types: readonly KnowledgeType[]): void {
    for (const type of types) {
      this.markDirty(projectId, type);
    }
  }

  recordGenerated(
    projectId: string,
    knowledgeType: KnowledgeType,
    contentHash: string,
  ): KnowledgeFileRow {
    const row = this.ensure(projectId, knowledgeType);
    const hashChanged = row.content_hash !== contentHash;
    if (!hashChanged) {
      this.db
        .prepare(
          `UPDATE knowledge_files SET last_generated_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(utcNow(), utcNow(), row.id);
      return this.assertRow(this.get(projectId, knowledgeType), 'knowledge_file', row.id);
    }

    const nextVersion = row.content_hash ? row.local_version + 1 : Math.max(row.local_version, 1);
    this.db
      .prepare(
        `UPDATE knowledge_files SET
          content_hash = ?,
          dirty = 1,
          local_version = ?,
          last_generated_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(contentHash, nextVersion, utcNow(), utcNow(), row.id);
    return this.assertRow(this.get(projectId, knowledgeType), 'knowledge_file', row.id);
  }

  markDriveSynced(projectId: string, knowledgeType: KnowledgeType): void {
    const row = this.ensure(projectId, knowledgeType);
    this.db
      .prepare(
        `UPDATE knowledge_files SET last_drive_sync_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(utcNow(), utcNow(), row.id);
  }

  markVerified(projectId: string, knowledgeType: KnowledgeType): void {
    const row = this.ensure(projectId, knowledgeType);
    this.db
      .prepare(
        `UPDATE knowledge_files SET
          dirty = 0,
          remote_version = local_version,
          last_verified_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(utcNow(), utcNow(), row.id);
  }

  anyDirty(projectId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM knowledge_files WHERE project_id = ? AND dirty = 1`,
      )
      .get(projectId) as { c: number };
    return row.c > 0;
  }

  maxLocalVersion(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(local_version), 0) AS v FROM knowledge_files WHERE project_id = ?`,
      )
      .get(projectId) as { v: number };
    return row.v;
  }

  maxRemoteVersion(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(remote_version), 0) AS v FROM knowledge_files WHERE project_id = ?`,
      )
      .get(projectId) as { v: number };
    return row.v;
  }
}
