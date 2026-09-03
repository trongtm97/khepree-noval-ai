import fs from 'node:fs';
import path from 'node:path';
import type { ExportExistingFilePolicy } from '../constants/export-settings';
import {
  fitPathLength,
  sanitizeFilename,
  versionedFilename,
} from './sanitize-filename';

export type AutoExportCollisionPolicy = ExportExistingFilePolicy | 'VERSION';

/**
 * Resolve a unique output path under `directory`.
 * Auto/unattended: ASK behaves like KEEP_BOTH (version) — never overwrite silently.
 */
export function resolveUniqueExportFilePath(input: {
  directory: string;
  fileName: string;
  policy: AutoExportCollisionPolicy;
  /** When true, treat ASK as VERSION (pipeline auto-export). */
  unattended?: boolean;
}): {
  filePath: string;
  createdVersion: number;
  skippedOverwrite: boolean;
} {
  const dir = path.resolve(input.directory);
  const safeName = fitPathLength(dir, sanitizeFilenameLeafPreservingExt(input.fileName));
  const policy =
    input.unattended && input.policy === 'ASK' ? 'KEEP_BOTH' : input.policy;

  const candidate = path.join(dir, safeName);
  if (!fs.existsSync(candidate)) {
    return { filePath: candidate, createdVersion: 1, skippedOverwrite: false };
  }

  if (policy === 'OVERWRITE') {
    return { filePath: candidate, createdVersion: 1, skippedOverwrite: false };
  }

  // KEEP_BOTH / VERSION / ASK(unattended)
  for (let v = 2; v <= 999; v += 1) {
    const named = fitPathLength(dir, versionedFilename(safeName, v));
    const next = path.join(dir, named);
    if (!fs.existsSync(next)) {
      return { filePath: next, createdVersion: v, skippedOverwrite: true };
    }
  }
  throw new Error('EXPORT_COLLISION_EXHAUSTED');
}

function sanitizeFilenameLeafPreservingExt(fileName: string): string {
  const base = path.basename(fileName);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return sanitizeFilename(base);
  const stem = base.slice(0, dot);
  const ext = base.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return `${sanitizeFilename(stem)}.${ext || 'txt'}`;
}

/** Idempotent key for one delivery export attempt. */
export function buildDeliveryExportFingerprint(parts: {
  campaignId: string;
  projectId: string;
  startToken: string;
  formats: string[];
  recipeMode: string;
}): string {
  return [
    parts.campaignId,
    parts.projectId,
    parts.startToken,
    parts.recipeMode,
    [...parts.formats].sort().join(','),
  ].join('|');
}
