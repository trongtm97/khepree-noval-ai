import type Database from 'better-sqlite3';

export abstract class BaseRepository {
  constructor(protected readonly db: Database.Database) {}

  protected assertRow<T>(row: T | null, entity: string, id: string): T {
    if (!row) {
      throw new Error(`Expected ${entity} row after write: ${id}`);
    }
    return row;
  }
}
