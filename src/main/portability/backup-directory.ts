import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import { AUTO_BACKUP_META_KEYS } from '@shared/constants/portability';

export function resolveBackupDirectory(
  db: DatabaseManager,
  defaultBackupsDir: string,
): string {
  const custom = db.appMeta.get(AUTO_BACKUP_META_KEYS.directory)?.trim();
  if (!custom) return defaultBackupsDir;
  try {
    fs.mkdirSync(custom, { recursive: true });
    return custom;
  } catch {
    return defaultBackupsDir;
  }
}

export function setBackupDirectory(db: DatabaseManager, directory: string | null): string {
  if (directory == null || directory.trim() === '') {
    db.appMeta.delete(AUTO_BACKUP_META_KEYS.directory);
    return '';
  }
  const normalized = path.resolve(directory.trim());
  fs.mkdirSync(normalized, { recursive: true });
  db.appMeta.set(AUTO_BACKUP_META_KEYS.directory, normalized);
  return normalized;
}

export function getBackupDirectory(db: DatabaseManager, defaultBackupsDir: string): {
  directory: string;
  isCustom: boolean;
} {
  const custom = db.appMeta.get(AUTO_BACKUP_META_KEYS.directory)?.trim();
  if (custom) {
    return { directory: custom, isCustom: true };
  }
  return { directory: defaultBackupsDir, isCustom: false };
}
