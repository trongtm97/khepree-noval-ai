import path from 'node:path';
import { statfs } from 'node:fs/promises';
import {
  STORAGE_ROOT_BACKUP_SUBDIR,
  STORAGE_ROOT_EXPORT_SUBDIR,
} from '@shared/constants/portability';
import type { StorageHealthResult } from '@shared/schemas/portability';
import type { DatabaseManager } from '../db/database-manager';
import { getAutoBackupConfig } from './auto-backup';
import {
  getBackupDirectory,
  resolveBackupDirectory,
  setBackupDirectory,
} from './backup-directory';
import { validateExportDirectory } from './export-directory-validator';
import {
  getDefaultExportDirectoryInfo,
  setDefaultExportDirectory,
} from './export-settings-service';

export function setupStorageRoot(
  db: DatabaseManager,
  rootPath: string,
): { root: string; exportDirectory: string; backupDirectory: string } {
  const root = path.resolve(rootPath.trim());
  const exportDir = path.join(root, STORAGE_ROOT_EXPORT_SUBDIR);
  const backupDir = path.join(root, STORAGE_ROOT_BACKUP_SUBDIR);

  const exportValidation = validateExportDirectory(exportDir, { create: true });
  if (!exportValidation.valid) {
    throw new Error(`EXPORT_DIRECTORY_${exportValidation.error ?? 'INACCESSIBLE'}`);
  }
  const backupValidation = validateExportDirectory(backupDir, { create: true });
  if (!backupValidation.valid) {
    throw new Error(`BACKUP_DIRECTORY_${backupValidation.error ?? 'INACCESSIBLE'}`);
  }

  setDefaultExportDirectory(db, exportValidation.path);
  setBackupDirectory(db, backupValidation.path);

  return {
    root,
    exportDirectory: exportValidation.path,
    backupDirectory: backupValidation.path,
  };
}

async function readFreeSpaceBytes(directory: string): Promise<number | null> {
  try {
    const stats = await statfs(directory);
    if (typeof stats.bavail === 'number' && typeof stats.bsize === 'number') {
      return stats.bavail * stats.bsize;
    }
  } catch {
    /* platform may not support statfs */
  }
  return null;
}

function healthErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'NOT_FOUND':
      return 'NOT_FOUND';
    case 'NOT_DIRECTORY':
      return 'NOT_DIRECTORY';
    case 'NOT_WRITABLE':
      return 'NOT_WRITABLE';
    default:
      return 'INACCESSIBLE';
  }
}

export async function checkStorageHealth(
  db: DatabaseManager,
  defaultBackupsDir: string,
): Promise<StorageHealthResult> {
  const exportInfo = getDefaultExportDirectoryInfo(db);
  const exportPath = exportInfo.directory ?? '';
  const exportCheck = exportPath
    ? validateExportDirectory(exportPath)
    : { valid: false, path: exportPath, error: 'NOT_FOUND' as const };

  const backupResolved = getBackupDirectory(db, defaultBackupsDir);
  const backupPath = backupResolved.directory;
  const backupCheck = validateExportDirectory(backupPath);

  const auto = getAutoBackupConfig(db);
  const freeSpaceBytes = exportCheck.valid
    ? await readFreeSpaceBytes(exportCheck.path)
    : backupCheck.valid
      ? await readFreeSpaceBytes(backupCheck.path)
      : null;

  const exportOk = exportCheck.valid;
  const backupOk = backupCheck.valid;
  const ok = exportOk && backupOk;

  let title: string;
  let message: string;
  if (ok) {
    title = '✓ Nơi lưu sẵn sàng';
    message = 'Thư mục xuất và sao lưu đều ghi được.';
  } else if (!exportOk && !backupOk) {
    title = 'Không thể truy cập nơi lưu';
    message = 'Kiểm tra lại thư mục xuất và sao lưu.';
  } else if (!exportOk) {
    title = 'Thư mục xuất không khả dụng';
    message = 'Chọn lại nơi lưu bản dịch hoặc thiết lập lại thư mục gốc.';
  } else {
    title = 'Thư mục sao lưu không khả dụng';
    message = 'Chọn lại thư mục sao lưu trong phần nâng cao.';
  }

  return {
    ok,
    title,
    message,
    exportPath: exportCheck.path || exportPath,
    exportOk,
    exportError: exportOk ? null : healthErrorMessage(exportCheck.error),
    backupPath,
    backupOk,
    backupError: backupOk ? null : healthErrorMessage(backupCheck.error),
    lastBackupAt: auto.lastRunAt,
    freeSpaceBytes,
  };
}

export function resolveConfiguredBackupDirectory(
  db: DatabaseManager,
  defaultBackupsDir: string,
): string {
  return resolveBackupDirectory(db, defaultBackupsDir);
}
