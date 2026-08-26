import fs from 'node:fs';
import path from 'node:path';
import {
  AUTO_BACKUP_META_KEYS,
  DEFAULT_AUTO_BACKUP_INTERVAL_HOURS,
  DEFAULT_AUTO_BACKUP_RETENTION,
} from '@shared/constants/portability';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { DatabaseManager } from '../db/database-manager';
import { removeBackupFile } from '../db/backup';
import { utcNow } from '../db/utils/timestamps';
import { logger } from '../logging/logger';

const AUTO_PREFIX = 'noveltrans-auto-';

export function getAutoBackupConfig(db: DatabaseManager): AutoBackupConfig {
  const enabled = db.appMeta.get(AUTO_BACKUP_META_KEYS.enabled) === 'true';
  const intervalHours = parseInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.intervalHours) ??
      String(DEFAULT_AUTO_BACKUP_INTERVAL_HOURS),
    10,
  );
  const retentionCount = parseInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.retentionCount) ??
      String(DEFAULT_AUTO_BACKUP_RETENTION),
    10,
  );
  return {
    enabled,
    intervalHours: Number.isFinite(intervalHours) ? intervalHours : DEFAULT_AUTO_BACKUP_INTERVAL_HOURS,
    retentionCount: Number.isFinite(retentionCount) ? retentionCount : DEFAULT_AUTO_BACKUP_RETENTION,
    lastRunAt: db.appMeta.get(AUTO_BACKUP_META_KEYS.lastRunAt),
  };
}

export function setAutoBackupConfig(
  db: DatabaseManager,
  patch: { enabled: boolean; intervalHours: number; retentionCount: number },
): AutoBackupConfig {
  db.appMeta.set(AUTO_BACKUP_META_KEYS.enabled, patch.enabled ? 'true' : 'false');
  db.appMeta.set(AUTO_BACKUP_META_KEYS.intervalHours, String(patch.intervalHours));
  db.appMeta.set(AUTO_BACKUP_META_KEYS.retentionCount, String(patch.retentionCount));
  return getAutoBackupConfig(db);
}

export function listBackupFiles(backupsDir: string): {
  fileName: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
  kind: 'auto' | 'manual' | 'migration';
}[] {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((name) => name.endsWith('.db') || name.endsWith('.zip'))
    .map((fileName) => {
      const filePath = path.join(backupsDir, fileName);
      const stat = fs.statSync(filePath);
      let kind: 'auto' | 'manual' | 'migration' = 'manual';
      if (fileName.startsWith(AUTO_PREFIX)) kind = 'auto';
      if (fileName.includes('pre-migration')) kind = 'migration';
      return {
        fileName,
        filePath,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        kind,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function runAutoBackupIfDue(input: {
  db: DatabaseManager;
  dbPath: string;
  backupsDir: string;
}): string | null {
  const config = getAutoBackupConfig(input.db);
  if (!config.enabled) return null;

  const lastRun = config.lastRunAt ? Date.parse(config.lastRunAt) : 0;
  const dueMs = config.intervalHours * 60 * 60 * 1000;
  if (Date.now() - lastRun < dueMs) return null;

  fs.mkdirSync(input.backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(input.backupsDir, `${AUTO_PREFIX}${timestamp}.db`);
  fs.copyFileSync(input.dbPath, target);
  input.db.appMeta.set(AUTO_BACKUP_META_KEYS.lastRunAt, utcNow());
  applyRetention(input.backupsDir, config.retentionCount);
  logger.info('Auto backup created', { target });
  return target;
}

export function applyRetention(backupsDir: string, retentionCount: number): void {
  const autoBackups = listBackupFiles(backupsDir).filter((b) => b.kind === 'auto');
  for (const entry of autoBackups.slice(retentionCount)) {
    removeBackupFile(entry.filePath);
  }
}

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackupScheduler(input: {
  db: DatabaseManager;
  dbPath: string;
  backupsDir: string;
  tickMs?: number;
}): void {
  stopAutoBackupScheduler();
  const tick = input.tickMs ?? 60 * 60 * 1000;
  autoBackupTimer = setInterval(() => {
    try {
      runAutoBackupIfDue(input);
    } catch (error) {
      logger.warn('Auto backup tick failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, tick);
  try {
    runAutoBackupIfDue(input);
  } catch {
    /* ignore startup failure */
  }
}

export function stopAutoBackupScheduler(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}

export function createManualDbBackup(dbPath: string, backupsDir: string): string {
  fs.mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupsDir, `noveltrans-manual-${timestamp}.db`);
  fs.copyFileSync(dbPath, target);
  return target;
}
