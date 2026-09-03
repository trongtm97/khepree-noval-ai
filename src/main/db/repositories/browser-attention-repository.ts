import type Database from 'better-sqlite3';
import type {
  BrowserAttentionAction,
  BrowserAttentionKind,
  BrowserAccountPoolState,
} from '@shared/constants/browser-account-pool';
import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { utcNow } from '../utils/timestamps';

export interface BrowserAttentionItemRow {
  id: string;
  account_kind: string;
  account_id: string;
  provider_id: string | null;
  provider_type: string | null;
  kind: string;
  pool_state: string;
  summary: string;
  suggested_action: string;
  diagnostics_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface CreateBrowserAttentionInput {
  accountKind: string;
  accountId: string;
  providerId?: string | null;
  providerType?: string | null;
  kind: BrowserAttentionKind;
  poolState: BrowserAccountPoolState;
  summary: string;
  suggestedAction: BrowserAttentionAction;
  diagnosticsPath?: string | null;
}

export class BrowserAttentionRepository extends BaseRepository {
  create(input: CreateBrowserAttentionInput): BrowserAttentionItemRow {
    const id = newId();
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_attention_items (
          id, account_kind, account_id, provider_id, provider_type,
          kind, pool_state, summary, suggested_action, diagnostics_path,
          status, created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, NULL)`,
      )
      .run(
        id,
        input.accountKind,
        input.accountId,
        input.providerId ?? null,
        input.providerType ?? null,
        input.kind,
        input.poolState,
        input.summary,
        input.suggestedAction,
        input.diagnosticsPath ?? null,
        now,
        now,
      );
    return this.getById(id)!;
  }

  getById(id: string): BrowserAttentionItemRow | null {
    return (
      (this.db
        .prepare(`SELECT * FROM browser_attention_items WHERE id = ?`)
        .get(id) as BrowserAttentionItemRow | undefined) ?? null
    );
  }

  listOpen(limit = 50): BrowserAttentionItemRow[] {
    return this.db
      .prepare(
        `SELECT * FROM browser_attention_items
         WHERE status = 'OPEN'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(Math.min(200, Math.max(1, limit))) as BrowserAttentionItemRow[];
  }

  resolve(id: string, status: 'RESOLVED' | 'DISMISSED' = 'RESOLVED'): boolean {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE browser_attention_items
         SET status = ?, resolved_at = ?, updated_at = ?
         WHERE id = ? AND status = 'OPEN'`,
      )
      .run(status, now, now, id);
    return result.changes > 0;
  }

  /** Dedup: one OPEN item per account+kind. */
  findOpen(accountKind: string, accountId: string, kind: string): BrowserAttentionItemRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM browser_attention_items
           WHERE account_kind = ? AND account_id = ? AND kind = ? AND status = 'OPEN'
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(accountKind, accountId, kind) as BrowserAttentionItemRow | undefined) ?? null
    );
  }
}

export function createBrowserAttentionRepository(
  db: Database.Database,
): BrowserAttentionRepository {
  return new BrowserAttentionRepository(db);
}
