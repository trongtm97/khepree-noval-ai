import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { utcNow } from './utils/timestamps';
import { withTransaction } from './transaction';
import {
  backupDatabaseFile,
  restoreDatabaseFromBackup,
} from './backup';

export interface MigrationDefinition {
  version: number;
  name: string;
  sql: string;
  checksum?: string;
  /** Optional JS backfill in the same transaction after `sql`. */
  run?: (db: Database.Database) => void;
}

export interface MigrationResult {
  applied: number[];
  skipped: number;
  lastBackupPath: string | null;
}

export function getCurrentSchemaVersion(db: Database.Database): number {
  const tableExists = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
    )
    .get() as { name: string } | undefined;

  if (!tableExists) {
    return 0;
  }

  const row = db
    .prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations`)
    .get() as { version: number };

  return row.version;
}

export function getPendingMigrations(
  db: Database.Database,
  migrations: MigrationDefinition[],
): MigrationDefinition[] {
  const current = getCurrentSchemaVersion(db);
  return migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
}

export function runMigrations(
  db: Database.Database,
  migrations: MigrationDefinition[],
  options: { dbPath: string; backupsDir: string },
): MigrationResult {
  const pending = getPendingMigrations(db, migrations);
  if (pending.length === 0) {
    return { applied: [], skipped: migrations.length, lastBackupPath: null };
  }

  const applied: number[] = [];
  let lastBackupPath: string | null = null;

  for (const migration of pending) {
    const currentVersion = getCurrentSchemaVersion(db);
    let backupPath: string | null = null;

    if (currentVersion > 0 && fs.existsSync(options.dbPath)) {
      backupPath = backupDatabaseFile(options.dbPath, options.backupsDir, {
        fileName: `khepree-novel-ai-migration-v${migration.version}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`,
      });
      lastBackupPath = backupPath;
    }

    try {
      withTransaction(db, () => {
        db.exec(migration.sql);
        migration.run?.(db);
        db.prepare(
          `INSERT INTO schema_migrations (version, name, applied_at, checksum)
           VALUES (?, ?, ?, ?)`,
        ).run(
          migration.version,
          migration.name,
          utcNow(),
          migration.checksum ?? '',
        );
      });
      applied.push(migration.version);

      // Phase 8: retain migration backup (atomic snapshot) after successful apply.
      if (backupPath) {
        lastBackupPath = backupPath;
      }
    } catch (error) {
      if (backupPath) {
        try {
          db.close();
        } catch {
          /* connection may already be closed */
        }
        restoreDatabaseFromBackup(options.dbPath, backupPath);
      }
      throw error;
    }
  }

  return {
    applied,
    skipped: migrations.length - getCurrentSchemaVersion(db),
    lastBackupPath,
  };
}
