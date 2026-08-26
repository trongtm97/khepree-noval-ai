import fs from 'node:fs';
import path from 'node:path';
import type { LogsTailRequest, LogsTailResponse } from '@shared/schemas/logs';
import { pathsService } from './paths-service';

export function tailApplicationLogs(request: LogsTailRequest = {}): LogsTailResponse {
  const logDir = pathsService.getPath('logs');
  const logPath = path.join(logDir, 'noveltrans.log');
  const maxLines = request.maxLines ?? 500;
  const levelFilter = request.level ?? 'all';

  if (!fs.existsSync(logPath)) {
    return { lines: [], path: logPath };
  }

  const raw = fs.readFileSync(logPath, 'utf8');
  const allLines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const slice = allLines.slice(-Math.max(maxLines * 2, maxLines));

  const parsed = slice
    .map((line, index) => {
      try {
        const entry = JSON.parse(line) as {
          level?: string;
          message?: string;
          timestamp?: string;
          context?: Record<string, unknown>;
        };
        const level = entry.level ?? 'info';
        if (levelFilter !== 'all' && level !== levelFilter) {
          return null;
        }
        const module =
          entry.context && typeof entry.context.module === 'string'
            ? entry.context.module
            : undefined;
        return {
          id: `${entry.timestamp ?? index}-${index}`,
          timestamp: entry.timestamp ?? new Date().toISOString(),
          level,
          message: entry.message ?? line,
          module,
          details: entry.context ? JSON.stringify(entry.context) : undefined,
        };
      } catch {
        if (levelFilter !== 'all') return null;
        return {
          id: `raw-${index}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: line,
        };
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(-maxLines);

  return { lines: parsed, path: logPath };
}
