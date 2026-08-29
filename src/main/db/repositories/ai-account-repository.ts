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
  display_name: string | null;
  profile_dir_name: string | null;
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
  display_name?: string | null;
  profile_dir_name?: string | null;
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
         ORDER BY CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END,
                  last_used_at ASC, created_at ASC`,
      )
      .all(providerId) as AiAccountRow[];
  }

  pickLeastRecentlyUsedReady(providerId: string): AiAccountRow | null {
    const rows = this.listReadyByProvider(providerId);
    return rows[0] ?? null;
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
          display_name, profile_dir_name,
          status, last_used_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.provider_id,
        input.google_account_id ?? null,
        input.google_email ?? null,
        input.session_location,
        input.display_name ?? null,
        input.profile_dir_name ?? null,
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

  updateDisplayName(id: string, displayName: string | null): AiAccountRow | null {
    const now = utcNow();
    this.db
      .prepare(`UPDATE ai_accounts SET display_name = ?, updated_at = ? WHERE id = ?`)
      .run(displayName, now, id);
    return this.getById(id);
  }

  updateProfileDirName(id: string, profileDirName: string | null): AiAccountRow | null {
    const now = utcNow();
    this.db
      .prepare(`UPDATE ai_accounts SET profile_dir_name = ?, updated_at = ? WHERE id = ?`)
      .run(profileDirName, now, id);
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
