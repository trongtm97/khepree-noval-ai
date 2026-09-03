import fs from 'node:fs';
import path from 'node:path';
import { pathsService } from '../services/paths-service';

/** Default retention for failure screenshots/HTML (7 days). */
export const DIAGNOSTICS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiagnosticsFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
}

function diagnosticsRoots(): string[] {
  const roots = [path.join(pathsService.getPath('data'), 'diagnostics')];
  try {
    roots.push(path.join(pathsService.getPath('cache'), 'automation'));
  } catch {
    /* cache path optional in tests */
  }
  return roots;
}

function walkFiles(root: string, out: DiagnosticsFileInfo[], depth = 0): void {
  if (depth > 6 || !fs.existsSync(root)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      walkFiles(full, out, depth + 1);
      continue;
    }
    if (!ent.isFile()) continue;
    if (!/\.(png|html|zip|json)$/i.test(ent.name)) continue;
    try {
      const st = fs.statSync(full);
      out.push({
        name: path.relative(root, full).replace(/\\/g, '/'),
        path: full,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    } catch {
      /* skip */
    }
  }
}

export function listFailureDiagnostics(limit = 100): DiagnosticsFileInfo[] {
  const files: DiagnosticsFileInfo[] = [];
  for (const root of diagnosticsRoots()) {
    walkFiles(root, files);
  }
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return files.slice(0, Math.min(500, Math.max(1, limit)));
}

export function deleteFailureDiagnostic(filePathOrName: string): boolean {
  const roots = diagnosticsRoots().map((r) => path.resolve(r));
  const full = path.resolve(filePathOrName);
  if (!roots.some((root) => full === root || full.startsWith(root + path.sep))) {
    throw new Error('Path escape blocked');
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  fs.unlinkSync(full);
  return true;
}

export function purgeFailureDiagnosticsOlderThan(
  maxAgeMs: number = DIAGNOSTICS_RETENTION_MS,
): { deleted: number; kept: number } {
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  let kept = 0;
  for (const file of listFailureDiagnostics(5000)) {
    const t = Date.parse(file.modifiedAt);
    if (!Number.isFinite(t)) continue;
    if (t < cutoff) {
      try {
        fs.unlinkSync(file.path);
        deleted += 1;
      } catch {
        /* skip */
      }
    } else {
      kept += 1;
    }
  }
  return { deleted, kept };
}
