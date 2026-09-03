import path from 'node:path';
import type { AppMetaRepository } from '../db/repositories/app-meta-repository';
import type { ProjectRow } from '../db/repositories/project-repository';
import type { WatchRootRow } from '../db/repositories/watch-root-repository';
import {
  DEFAULT_WATCH_MAX_JOBS_PER_BURST,
  WATCH_POLICY_META_KEYS,
} from '@shared/constants/source-folder';

function parseHourMinute(value: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function isQuietHoursNow(meta: AppMetaRepository, now = new Date()): boolean {
  if (meta.get(WATCH_POLICY_META_KEYS.quietHoursEnabled) !== '1') {
    return false;
  }
  const start = parseHourMinute(meta.get(WATCH_POLICY_META_KEYS.quietHoursStart));
  const end = parseHourMinute(meta.get(WATCH_POLICY_META_KEYS.quietHoursEnd));
  if (!start || !end) return false;

  const current = minutesSinceMidnight(now.getHours(), now.getMinutes());
  const startMin = minutesSinceMidnight(start.hour, start.minute);
  const endMin = minutesSinceMidnight(end.hour, end.minute);

  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return current >= startMin && current < endMin;
  }
  return current >= startMin || current < endMin;
}

export function readMaxJobsPerBurst(meta: AppMetaRepository): number {
  const raw = meta.get(WATCH_POLICY_META_KEYS.maxJobsPerBurst);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_WATCH_MAX_JOBS_PER_BURST;
  }
  return Math.min(50, Math.floor(parsed));
}

export function isGlobalWatchAutoRunEnabled(meta: AppMetaRepository): boolean {
  const raw = meta.get(WATCH_POLICY_META_KEYS.autoRunEnabled);
  return raw == null || raw === '1';
}

export function shouldAutoRunWatchPipeline(input: {
  meta: AppMetaRepository;
  project: ProjectRow;
  watchRoot?: WatchRootRow | null;
}): boolean {
  if (!isGlobalWatchAutoRunEnabled(input.meta)) return false;
  if (input.watchRoot && input.watchRoot.watch_auto_run !== 1) return false;
  return (
    input.project.auto_queue_new_chapters === 1 ||
    input.project.auto_translate_new_chapters === 1
  );
}

/**
 * Resolve file path must stay inside watch root; reject symlink escape.
 */
export function assertPathContainedInRoot(rootPath: string, filePath: string): boolean {
  const root = path.resolve(rootPath);
  const target = path.resolve(filePath);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return false;
  }
  return true;
}
