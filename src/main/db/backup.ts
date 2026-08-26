import fs from 'node:fs';
import path from 'node:path';

export function backupDatabaseFile(
  dbPath: string,
  backupsDir: string,
): string {
  fs.mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `noveltrans-pre-migration-${timestamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

export function restoreDatabaseFromBackup(dbPath: string, backupPath: string): void {
  fs.copyFileSync(backupPath, dbPath);
}

export function removeBackupFile(backupPath: string): void {
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
}
