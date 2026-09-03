import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BATCH_IMPORT_DEFAULT_LIMITS,
  NOVEL_FILE_EXTENSIONS,
  type BatchImportLimits,
} from '@shared/constants/batch-import';
import { naturalCompare } from '@shared/utils/natural-sort';

export type DiscoveredCandidate =
  | {
      kind: 'folder';
      absolutePath: string;
      label: string;
    }
  | {
      kind: 'file';
      absolutePath: string;
      label: string;
      extension: string;
    };

export class DiscoverCandidatesError extends Error {
  readonly code: 'TOO_MANY_ENTRIES' | 'TOO_MANY_CANDIDATES' | 'CANCELLED' | 'IO';

  constructor(code: DiscoverCandidatesError['code'], message: string) {
    super(message);
    this.name = 'DiscoverCandidatesError';
    this.code = code;
  }
}

function isNovelFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return NOVEL_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function fileExtension(name: string): string {
  return path.extname(name).toLowerCase();
}

async function folderHasTxtContent(folderPath: string): Promise<boolean> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  return entries.some(
    (entry) =>
      entry.isFile() &&
      (entry.name.toLowerCase().endsWith('.txt') ||
        entry.name.toLowerCase().endsWith('.text')),
  );
}

/**
 * Discover novel candidates under a root folder:
 * - Each direct child directory with ≥1 TXT/TEXT file → folder novel
 * - Each TXT/EPUB/DOCX file directly in root → single-file novel
 */
export async function discoverNovelCandidates(
  rootPath: string,
  options?: {
    limits?: Partial<BatchImportLimits>;
    signal?: AbortSignal;
  },
): Promise<DiscoveredCandidate[]> {
  const limits: BatchImportLimits = {
    ...BATCH_IMPORT_DEFAULT_LIMITS,
    ...options?.limits,
  };
  if (options?.signal?.aborted) {
    throw new DiscoverCandidatesError('CANCELLED', 'Discovery cancelled');
  }

  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    throw new DiscoverCandidatesError(
      'IO',
      error instanceof Error ? error.message : 'Failed to read folder',
    );
  }

  if (entries.length > limits.maxRootListingEntries) {
    throw new DiscoverCandidatesError(
      'TOO_MANY_ENTRIES',
      `Root listing has ${entries.length} entries (limit ${limits.maxRootListingEntries})`,
    );
  }

  const sorted = [...entries].sort((a, b) => naturalCompare(a.name, b.name));
  const candidates: DiscoveredCandidate[] = [];

  for (const entry of sorted) {
    if (options?.signal?.aborted) {
      throw new DiscoverCandidatesError('CANCELLED', 'Discovery cancelled');
    }
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      // Skip common junk / hidden
      if (entry.name === '.' || entry.name === '..' || entry.name.startsWith('.')) {
        continue;
      }
      try {
        const hasTxt = await folderHasTxtContent(absolutePath);
        if (hasTxt) {
          candidates.push({
            kind: 'folder',
            absolutePath,
            label: entry.name,
          });
        }
      } catch {
        // unreadable dir — skip
      }
    } else if (entry.isFile() && isNovelFileName(entry.name)) {
      candidates.push({
        kind: 'file',
        absolutePath,
        label: entry.name,
        extension: fileExtension(entry.name),
      });
    }

    if (candidates.length > limits.maxCandidates) {
      throw new DiscoverCandidatesError(
        'TOO_MANY_CANDIDATES',
        `More than ${limits.maxCandidates} novel candidates found`,
      );
    }
  }

  return candidates.sort((a, b) => naturalCompare(a.label, b.label));
}
