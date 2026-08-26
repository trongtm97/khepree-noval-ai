import type Database from 'better-sqlite3';
import { BaseRepository } from './base-repository';
import { utcNow } from '../utils/timestamps';

export class AppMetaRepository extends BaseRepository {
  get(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, utcNow());
  }

  delete(key: string): void {
    this.db.prepare(`DELETE FROM app_meta WHERE key = ?`).run(key);
  }
}

export function createAppMetaRepository(db: Database.Database): AppMetaRepository {
  return new AppMetaRepository(db);
}
