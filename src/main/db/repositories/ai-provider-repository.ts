import { BaseRepository } from './base-repository';
import { utcNow } from '../utils/timestamps';
import type { AiProviderStatus, AiProviderType } from '@shared/constants/ai-provider';

export interface AiProviderRow {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: number;
  enabled: number;
  fallback_allowed: number;
  created_at: string;
  updated_at: string;
}

export class AiProviderRepository extends BaseRepository {
  getById(id: string): AiProviderRow | null {
    return (
      (this.db.prepare(`SELECT * FROM ai_providers WHERE id = ?`).get(id) as
        | AiProviderRow
        | undefined) ?? null
    );
  }

  getByType(type: AiProviderType): AiProviderRow | null {
    return (
      (this.db.prepare(`SELECT * FROM ai_providers WHERE type = ?`).get(type) as
        | AiProviderRow
        | undefined) ?? null
    );
  }

  listAll(): AiProviderRow[] {
    return this.db
      .prepare(`SELECT * FROM ai_providers ORDER BY priority ASC, name ASC`)
      .all() as AiProviderRow[];
  }

  listEnabledOrdered(): AiProviderRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_providers
         WHERE enabled = 1 AND status != 'DISABLED'
         ORDER BY priority ASC`,
      )
      .all() as AiProviderRow[];
  }

  setPriority(id: string, priority: number): AiProviderRow | null {
    const now = utcNow();
    this.db
      .prepare(`UPDATE ai_providers SET priority = ?, updated_at = ? WHERE id = ?`)
      .run(priority, now, id);
    return this.getById(id);
  }

  setEnabled(id: string, enabled: boolean): AiProviderRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_providers SET enabled = ?, status = CASE
           WHEN ? = 0 THEN 'DISABLED'
           WHEN status = 'DISABLED' THEN 'LOGIN_REQUIRED'
           ELSE status
         END, updated_at = ? WHERE id = ?`,
      )
      .run(enabled ? 1 : 0, enabled ? 1 : 0, now, id);
    return this.getById(id);
  }

  setStatus(id: string, status: AiProviderStatus): AiProviderRow | null {
    const now = utcNow();
    this.db
      .prepare(`UPDATE ai_providers SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);
    return this.getById(id);
  }

  setFallbackAllowed(id: string, allowed: boolean): AiProviderRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_providers SET fallback_allowed = ?, updated_at = ? WHERE id = ?`,
      )
      .run(allowed ? 1 : 0, now, id);
    return this.getById(id);
  }
}
