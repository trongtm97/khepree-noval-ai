import fs from 'node:fs';
import path from 'node:path';
import {
  AUTO_BACKUP_META_KEYS,
  BACKUP_ARCHIVE_EXTENSION,
  DEFAULT_AUTO_BACKUP_ENABLED,
  DEFAULT_AUTO_BACKUP_INTERVAL_HOURS,
  DEFAULT_AUTO_BACKUP_RETENTION,
  DEFAULT_RETENTION_MONTHLY,
  DEFAULT_RETENTION_WEEKLY,
} from '@shared/constants/portability';
import type { AutoBackupConfig } from '@shared/schemas/portability';
import type { DatabaseManager } from '../db/database-manager';
import { atomicBackupDatabase, removeBackupFile } from '../db/backup';
import { utcNow } from '../db/utils/timestamps';
import { logger } from '../logging/logger';
import { createBackupArchive } from './backup-archive';
import { resolveBackupDirectory } from './backup-directory';

const AUTO_PREFIX = 'noveltrans-auto-';

export interface TieredRetentionConfig {
  daily: number;
  weekly: number;
  monthly: number;
}

function parsePositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = parseInt(raw ?? String(fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getAutoBackupConfig(db: DatabaseManager): AutoBackupConfig {
  const enabledRaw = db.appMeta.get(AUTO_BACKUP_META_KEYS.enabled);
  const enabled =
    enabledRaw == null ? DEFAULT_AUTO_BACKUP_ENABLED : enabledRaw === 'true';
  const intervalHours = parsePositiveInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.intervalHours),
    DEFAULT_AUTO_BACKUP_INTERVAL_HOURS,
  );
  const legacyDaily = parsePositiveInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.retentionCount),
    DEFAULT_AUTO_BACKUP_RETENTION,
  );
  const retentionDaily = parsePositiveInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.retentionDaily),
    legacyDaily,
  );
  const retentionWeekly = parsePositiveInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.retentionWeekly),
    DEFAULT_RETENTION_WEEKLY,
  );
  const retentionMonthly = parsePositiveInt(
    db.appMeta.get(AUTO_BACKUP_META_KEYS.retentionMonthly),
    DEFAULT_RETENTION_MONTHLY,
  );
  return {
    enabled,
    intervalHours,
    retentionDaily,
    retentionWeekly,
    retentionMonthly,
    retentionCount: retentionDaily,
    lastRunAt: db.appMeta.get(AUTO_BACKUP_META_KEYS.lastRunAt),
  };
}

export function setAutoBackupConfig(
  db: DatabaseManager,
  patch: {
    enabled: boolean;
    intervalHours: number;
    retentionDaily: number;
    retentionWeekly: number;
    retentionMonthly: number;
  },
): AutoBackupConfig {
  db.appMeta.set(AUTO_BACKUP_META_KEYS.enabled, patch.enabled ? 'true' : 'false');
  db.appMeta.set(AUTO_BACKUP_META_KEYS.intervalHours, String(patch.intervalHours));
  db.appMeta.set(AUTO_BACKUP_META_KEYS.retentionDaily, String(patch.retentionDaily));
  db.appMeta.set(AUTO_BACKUP_META_KEYS.retentionWeekly, String(patch.retentionWeekly));
  db.appMeta.set(AUTO_BACKUP_META_KEYS.retentionMonthly, String(patch.retentionMonthly));
  db.appMeta.set(AUTO_BACKUP_META_KEYS.retentionCount, String(patch.retentionDaily));
  return getAutoBackupConfig(db);
}

export function listBackupFiles(backupsDir: string): {
  fileName: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
  kind: 'auto' | 'manual' | 'migration' | 'archive';
}[] {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((name) => name.endsWith('.db') || name.endsWith('.zip'))
    .map((fileName) => {
      const filePath = path.join(backupsDir, fileName);
      const stat = fs.statSync(filePath);
      let kind: 'auto' | 'manual' | 'migration' | 'archive' = 'archive';
      if (fileName.startsWith(AUTO_PREFIX)) kind = 'auto';
      else if (fileName.includes('pre-migration') || fileName.includes('migration-v'))
        kind = 'migration';
      else if (fileName.includes('manual')) kind = 'manual';
      else if (fileName.endsWith('.zip')) kind = 'archive';
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

function isoWeekKey(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function applyTieredRetention(
  backupsDir: string,
  config: TieredRetentionConfig,
): void {
  const autoFiles = listBackupFiles(backupsDir)
    .filter((b) => b.kind === 'auto')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (autoFiles.length === 0) return;

  const keep = new Set<string>();

  for (const file of autoFiles.slice(0, config.daily)) {
    keep.add(file.filePath);
  }

  const weeksSeen: string[] = [];
  for (const file of autoFiles) {
    const week = isoWeekKey(file.createdAt);
    if (!weeksSeen.includes(week)) {
      weeksSeen.push(week);
      if (weeksSeen.length <= config.weekly) keep.add(file.filePath);
    }
  }

  const monthsSeen: string[] = [];
  for (const file of autoFiles) {
    const month = file.createdAt.slice(0, 7);
    if (!monthsSeen.includes(month)) {
      monthsSeen.push(month);
      if (monthsSeen.length <= config.monthly) keep.add(file.filePath);
    }
  }

  for (const file of autoFiles) {
    if (!keep.has(file.filePath)) removeBackupFile(file.filePath);
  }
}

/** @deprecated Flat retention — use applyTieredRetention. */
export function applyRetention(backupsDir: string, retentionCount: number): void {
  applyTieredRetention(backupsDir, {
    daily: retentionCount,
    weekly: DEFAULT_RETENTION_WEEKLY,
    monthly: DEFAULT_RETENTION_MONTHLY,
  });
}

export async function runManualFullBackup(input: {
  db: DatabaseManager;
  dbPath: string;
  backupsDir: string;
}): Promise<string> {
  const config = getAutoBackupConfig(input.db);
  fs.mkdirSync(input.backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(
    input.backupsDir,
    `${AUTO_PREFIX}${timestamp}${BACKUP_ARCHIVE_EXTENSION}`,
  );

  const result = await createBackupArchive({
    kind: 'full',
    db: input.db,
    dbPath: input.dbPath,
    backupsDir: input.backupsDir,
    outputPath: target,
    includeCredentials: false,
  });

  input.db.appMeta.set(AUTO_BACKUP_META_KEYS.lastRunAt, utcNow());
  applyTieredRetention(input.backupsDir, {
    daily: config.retentionDaily,
    weekly: config.retentionWeekly,
    monthly: config.retentionMonthly,
  });
  logger.info('Manual full backup created', { target: result.filePath });
  return result.filePath;
}

export async function runAutoBackupIfDue(input: {
  db: DatabaseManager;
  dbPath: string;
  backupsDir: string;
}): Promise<string | null> {
  const config = getAutoBackupConfig(input.db);
  if (!config.enabled) return null;

  const lastRun = config.lastRunAt ? Date.parse(config.lastRunAt) : 0;
  const dueMs = config.intervalHours * 60 * 60 * 1000;
  if (Date.now() - lastRun < dueMs) return null;

  fs.mkdirSync(input.backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(
    input.backupsDir,
    `${AUTO_PREFIX}${timestamp}${BACKUP_ARCHIVE_EXTENSION}`,
  );

  const result = await createBackupArchive({
    kind: 'full',
    db: input.db,
    dbPath: input.dbPath,
    backupsDir: input.backupsDir,
    outputPath: target,
    includeCredentials: false,
  });

  input.db.appMeta.set(AUTO_BACKUP_META_KEYS.lastRunAt, utcNow());
  applyTieredRetention(input.backupsDir, {
    daily: config.retentionDaily,
    weekly: config.retentionWeekly,
    monthly: config.retentionMonthly,
  });
  logger.info('Auto backup created', { target: result.filePath });
  return result.filePath;
}

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackupScheduler(input: {
  db: DatabaseManager;
  dbPath: string;
  defaultBackupsDir: string;
  tickMs?: number;
}): void {
  stopAutoBackupScheduler();
  const tick = input.tickMs ?? 60 * 60 * 1000;
  const resolveDir = () =>
    resolveBackupDirectory(input.db, input.defaultBackupsDir);

  autoBackupTimer = setInterval(() => {
    void runAutoBackupIfDue({
      db: input.db,
      dbPath: input.dbPath,
      backupsDir: resolveDir(),
    }).catch((error) => {
      logger.warn('Auto backup tick failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, tick);

  void runAutoBackupIfDue({
    db: input.db,
    dbPath: input.dbPath,
    backupsDir: resolveDir(),
  }).catch(() => {
    /* ignore startup failure */
  });
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
  atomicBackupDatabase(dbPath, target);
  return target;
}
