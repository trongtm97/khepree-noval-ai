import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function sqlFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "''");
}

/** SQLite VACUUM INTO — online, WAL-safe, no live file copy. */
export function atomicBackupDatabase(sourceDbPath: string, targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

  const source = new Database(sourceDbPath);
  try {
    source.pragma('wal_checkpoint(FULL)');
    source.exec(`VACUUM INTO '${sqlFilePath(targetPath)}'`);
  } finally {
    source.close();
  }
}

export function backupDatabaseFile(
  dbPath: string,
  backupsDir: string,
  options?: { fileName?: string },
): string {
  fs.mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    backupsDir,
    options?.fileName ?? `noveltrans-pre-migration-${timestamp}.db`,
  );
  atomicBackupDatabase(dbPath, backupPath);
  return backupPath;
}

export function restoreDatabaseFromBackup(dbPath: string, backupPath: string): void {
  for (const suffix of ['', '-wal', '-shm'] as const) {
    const side = `${dbPath}${suffix}`;
    if (fs.existsSync(side)) fs.unlinkSync(side);
  }
  fs.copyFileSync(backupPath, dbPath);
}

export function removeBackupFile(backupPath: string): void {
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
}
