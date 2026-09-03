import type Database from 'better-sqlite3';
import path from 'node:path';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface WatchRootRow {
  id: string;
  root_path: string;
  label: string | null;
  campaign_id: string | null;
  enabled: number;
  watch_auto_run: number;
  created_at: string;
  updated_at: string;
}

export interface WatchRootBindingRow {
  id: string;
  watch_root_id: string;
  project_id: string;
  relative_subpath: string | null;
  created_at: string;
}

export class WatchRootRepository extends BaseRepository {
  createRoot(input: {
    rootPath: string;
    label?: string | null;
    campaignId?: string | null;
    enabled?: boolean;
    watchAutoRun?: boolean;
  }): WatchRootRow {
    const id = newId();
    const ts = touchTimestamps();
    const normalizedRoot = path.resolve(input.rootPath);
    this.db
      .prepare(
        `INSERT INTO watch_roots
         (id, root_path, label, campaign_id, enabled, watch_auto_run, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        normalizedRoot,
        input.label ?? null,
        input.campaignId ?? null,
        input.enabled !== false ? 1 : 0,
        input.watchAutoRun !== false ? 1 : 0,
        ts.created_at,
        ts.updated_at,
      );
    return this.getRootById(id)!;
  }

  getRootById(id: string): WatchRootRow | null {
    return (
      (this.db.prepare(`SELECT * FROM watch_roots WHERE id = ?`).get(id) as
        | WatchRootRow
        | undefined) ?? null
    );
  }

  getRootByPath(rootPath: string): WatchRootRow | null {
    return (
      (this.db.prepare(`SELECT * FROM watch_roots WHERE root_path = ?`).get(rootPath) as
        | WatchRootRow
        | undefined) ?? null
    );
  }

  listEnabledRoots(): WatchRootRow[] {
    return this.db
      .prepare(`SELECT * FROM watch_roots WHERE enabled = 1 ORDER BY created_at ASC`)
      .all() as WatchRootRow[];
  }

  listAllRoots(): WatchRootRow[] {
    return this.db
      .prepare(`SELECT * FROM watch_roots ORDER BY created_at ASC`)
      .all() as WatchRootRow[];
  }

  bindProject(input: {
    watchRootId: string;
    projectId: string;
    relativeSubpath?: string | null;
  }): WatchRootBindingRow {
    const existing = this.db
      .prepare(
        `SELECT * FROM watch_root_bindings WHERE watch_root_id = ? AND project_id = ?`,
      )
      .get(input.watchRootId, input.projectId) as WatchRootBindingRow | undefined;
    if (existing) {
      return existing;
    }
    const id = newId();
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO watch_root_bindings
         (id, watch_root_id, project_id, relative_subpath, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.watchRootId,
        input.projectId,
        input.relativeSubpath ?? null,
        now,
      );
    return this.getBindingById(id)!;
  }

  getBindingById(id: string): WatchRootBindingRow | null {
    return (
      (this.db.prepare(`SELECT * FROM watch_root_bindings WHERE id = ?`).get(id) as
        | WatchRootBindingRow
        | undefined) ?? null
    );
  }

  listBindingsForRoot(watchRootId: string): WatchRootBindingRow[] {
    return this.db
      .prepare(
        `SELECT * FROM watch_root_bindings WHERE watch_root_id = ? ORDER BY created_at ASC`,
      )
      .all(watchRootId) as WatchRootBindingRow[];
  }

  listBindingsForProject(projectId: string): WatchRootBindingRow[] {
    return this.db
      .prepare(
        `SELECT * FROM watch_root_bindings WHERE project_id = ? ORDER BY created_at ASC`,
      )
      .all(projectId) as WatchRootBindingRow[];
  }

  resolveProjectForFile(rootPath: string, filePath: string): string | null {
    const normalizedRoot = path.resolve(rootPath);
    const root = this.getRootByPath(normalizedRoot);
    if (!root) return null;
    const bindings = this.listBindingsForRoot(root.id);
    if (bindings.length === 0) return null;

    const normalizedFile = path.resolve(filePath);
    const rel = path.relative(normalizedRoot, normalizedFile).replace(/\\/g, '/');
    if (rel.startsWith('..')) return null;

    let best: { projectId: string; len: number } | null = null;
    for (const binding of bindings) {
      const sub = binding.relative_subpath?.replace(/\\/g, '/') ?? '';
      if (!sub) {
        if (!best) best = { projectId: binding.project_id, len: 0 };
        continue;
      }
      const prefix = sub.endsWith('/') ? sub : `${sub}/`;
      if (rel === sub || rel.startsWith(prefix)) {
        if (!best || prefix.length > best.len) {
          best = { projectId: binding.project_id, len: prefix.length };
        }
      }
    }
    return best?.projectId ?? bindings[0]?.project_id ?? null;
  }
}
