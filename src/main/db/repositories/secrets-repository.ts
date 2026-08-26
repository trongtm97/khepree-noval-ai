import { BaseRepository } from './base-repository';
import { newId } from '../utils/uuid';
import { touchTimestamps, utcNow } from '../utils/timestamps';

export interface SecretRow {
  id: string;
  secret_key: string;
  kind: string;
  owner_type: string | null;
  owner_id: string | null;
  encrypted_blob: Buffer;
  created_at: string;
  updated_at: string;
}

export interface UpsertSecretInput {
  secretKey: string;
  kind: string;
  ownerType?: string | null;
  ownerId?: string | null;
  encryptedBlob: Buffer;
}

export class SecretsRepository extends BaseRepository {
  upsert(input: UpsertSecretInput): SecretRow {
    const existing = this.getByKey(input.secretKey);
    const now = utcNow();

    if (existing) {
      this.db
        .prepare(
          `UPDATE secrets SET
            kind = ?,
            owner_type = ?,
            owner_id = ?,
            encrypted_blob = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.kind,
          input.ownerType ?? null,
          input.ownerId ?? null,
          input.encryptedBlob,
          now,
          existing.id,
        );
      return this.assertRow(this.getByKey(input.secretKey), 'secret', existing.id);
    }

    const id = newId();
    const ts = touchTimestamps();
    this.db
      .prepare(
        `INSERT INTO secrets (
          id, secret_key, kind, owner_type, owner_id, encrypted_blob, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.secretKey,
        input.kind,
        input.ownerType ?? null,
        input.ownerId ?? null,
        input.encryptedBlob,
        ts.created_at,
        ts.updated_at,
      );

    return this.assertRow(this.getByKey(input.secretKey), 'secret', id);
  }

  getByKey(secretKey: string): SecretRow | null {
    const row = this.db
      .prepare(`SELECT * FROM secrets WHERE secret_key = ?`)
      .get(secretKey) as SecretRow | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      encrypted_blob: Buffer.from(row.encrypted_blob),
    };
  }

  getById(id: string): SecretRow | null {
    const row = this.db.prepare(`SELECT * FROM secrets WHERE id = ?`).get(id) as
      | SecretRow
      | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      encrypted_blob: Buffer.from(row.encrypted_blob),
    };
  }

  deleteByKey(secretKey: string): boolean {
    const result = this.db.prepare(`DELETE FROM secrets WHERE secret_key = ?`).run(secretKey);
    return result.changes > 0;
  }

  deleteByOwner(ownerType: string, ownerId: string): number {
    const result = this.db
      .prepare(`DELETE FROM secrets WHERE owner_type = ? AND owner_id = ?`)
      .run(ownerType, ownerId);
    return result.changes;
  }
}
