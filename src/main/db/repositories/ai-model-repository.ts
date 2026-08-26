import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface AiModelRow {
  id: string;
  provider_id: string;
  model_name: string;
  display_name: string;
  capabilities: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertAiModelInput {
  provider_id: string;
  model_name: string;
  display_name: string;
  capabilities?: string | null;
  enabled?: boolean;
}

export class AiModelRepository extends BaseRepository {
  getById(id: string): AiModelRow | null {
    return (
      (this.db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(id) as
        | AiModelRow
        | undefined) ?? null
    );
  }

  listByProvider(providerId: string): AiModelRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_models WHERE provider_id = ? ORDER BY display_name ASC`,
      )
      .all(providerId) as AiModelRow[];
  }

  listEnabledByProvider(providerId: string): AiModelRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_models
         WHERE provider_id = ? AND enabled = 1
         ORDER BY display_name ASC`,
      )
      .all(providerId) as AiModelRow[];
  }

  upsert(input: UpsertAiModelInput): AiModelRow {
    const existing = this.db
      .prepare(
        `SELECT * FROM ai_models WHERE provider_id = ? AND model_name = ?`,
      )
      .get(input.provider_id, input.model_name) as AiModelRow | undefined;

    if (existing) {
      const now = utcNow();
      this.db
        .prepare(
          `UPDATE ai_models SET
            display_name = ?,
            capabilities = COALESCE(?, capabilities),
            enabled = COALESCE(?, enabled),
            updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.display_name,
          input.capabilities ?? null,
          input.enabled === undefined ? null : input.enabled ? 1 : 0,
          now,
          existing.id,
        );
      return this.assertRow(this.getById(existing.id), 'ai_model', existing.id);
    }

    const id = newId();
    const { created_at, updated_at } = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO ai_models (
          id, provider_id, model_name, display_name, capabilities, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.provider_id,
        input.model_name,
        input.display_name,
        input.capabilities ?? null,
        input.enabled === false ? 0 : 1,
        created_at,
        updated_at,
      );
    return this.assertRow(this.getById(id), 'ai_model', id);
  }

  setEnabled(id: string, enabled: boolean): AiModelRow | null {
    const now = utcNow();
    this.db
      .prepare(`UPDATE ai_models SET enabled = ?, updated_at = ? WHERE id = ?`)
      .run(enabled ? 1 : 0, now, id);
    return this.getById(id);
  }
}
