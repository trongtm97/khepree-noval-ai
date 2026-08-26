import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';
import type { AiAccountStatus } from '@shared/constants/ai-provider';

export interface AiAccountRow {
  id: string;
  provider_id: string;
  google_account_id: string | null;
  google_email: string | null;
  session_location: string;
  status: string;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAiAccountInput {
  provider_id: string;
  session_location: string;
  google_account_id?: string | null;
  google_email?: string | null;
  status?: AiAccountStatus;
}

export class AiAccountRepository extends BaseRepository {
  getById(id: string): AiAccountRow | null {
    return (
      (this.db.prepare(`SELECT * FROM ai_accounts WHERE id = ?`).get(id) as
        | AiAccountRow
        | undefined) ?? null
    );
  }

  listByProvider(providerId: string): AiAccountRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_accounts WHERE provider_id = ? ORDER BY created_at DESC`,
      )
      .all(providerId) as AiAccountRow[];
  }

  listAll(): AiAccountRow[] {
    return this.db
      .prepare(`SELECT * FROM ai_accounts ORDER BY created_at DESC`)
      .all() as AiAccountRow[];
  }

  listReadyByProvider(providerId: string): AiAccountRow[] {
    return this.db
      .prepare(
        `SELECT * FROM ai_accounts
         WHERE provider_id = ? AND status = 'READY'
         ORDER BY CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END,
                  last_used_at DESC, created_at ASC`,
      )
      .all(providerId) as AiAccountRow[];
  }

  findReadyForGoogleAccount(
    providerId: string,
    googleAccountId: string,
  ): AiAccountRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM ai_accounts
           WHERE provider_id = ? AND google_account_id = ? AND status = 'READY'
           LIMIT 1`,
        )
        .get(providerId, googleAccountId) as AiAccountRow | undefined) ?? null
    );
  }

  findByGoogleAccount(
    providerId: string,
    googleAccountId: string,
  ): AiAccountRow | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM ai_accounts
           WHERE provider_id = ? AND google_account_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(providerId, googleAccountId) as AiAccountRow | undefined) ?? null
    );
  }

  create(input: CreateAiAccountInput): AiAccountRow {
    const id = newId();
    const { created_at, updated_at } = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO ai_accounts (
          id, provider_id, google_account_id, google_email, session_location,
          status, last_used_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.provider_id,
        input.google_account_id ?? null,
        input.google_email ?? null,
        input.session_location,
        input.status ?? 'LOGIN_REQUIRED',
        created_at,
        updated_at,
      );
    return this.assertRow(this.getById(id), 'ai_account', id);
  }

  setStatus(
    id: string,
    status: AiAccountStatus,
    lastError?: string | null,
  ): AiAccountRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, lastError ?? null, now, id);
    return this.getById(id);
  }

  markUsed(id: string): AiAccountRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_accounts SET last_used_at = ?, updated_at = ?, last_error = NULL WHERE id = ?`,
      )
      .run(now, now, id);
    return this.getById(id);
  }

  updateEmail(id: string, email: string | null): AiAccountRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_accounts SET google_email = ?, updated_at = ? WHERE id = ?`,
      )
      .run(email, now, id);
    return this.getById(id);
  }

  linkGoogleAccount(id: string, googleAccountId: string | null): AiAccountRow | null {
    const now = utcNow();
    this.db
      .prepare(
        `UPDATE ai_accounts SET google_account_id = ?, updated_at = ? WHERE id = ?`,
      )
      .run(googleAccountId, now, id);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM ai_accounts WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}
