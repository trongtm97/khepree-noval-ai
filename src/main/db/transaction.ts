import type Database from 'better-sqlite3';

export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}
