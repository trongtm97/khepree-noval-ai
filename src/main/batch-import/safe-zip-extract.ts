import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {
  BATCH_IMPORT_DEFAULT_LIMITS,
  type BatchImportLimits,
} from '@shared/constants/batch-import';

export class SafeZipExtractError extends Error {
  readonly code:
    | 'ZIP_TRAVERSAL'
    | 'ZIP_ABSOLUTE_PATH'
    | 'ZIP_SYMLINK'
    | 'ZIP_TOO_MANY_ENTRIES'
    | 'ZIP_ENTRY_TOO_LARGE'
    | 'ZIP_UNCOMPRESSED_TOO_LARGE'
    | 'ZIP_DEPTH_EXCEEDED'
    | 'ZIP_INVALID'
    | 'ZIP_CANCELLED';

  constructor(
    code: SafeZipExtractError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'SafeZipExtractError';
    this.code = code;
  }
}

export interface SafeZipExtractOptions {
  zipPath: string;
  destinationDir: string;
  limits?: Partial<BatchImportLimits>;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number, entryName: string) => void;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SafeZipExtractError('ZIP_CANCELLED', 'ZIP extract cancelled');
  }
}

function isUnsafeZipPath(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return true;
  if (normalized.startsWith('/')) return true;
  if (/^[a-zA-Z]:\//.test(normalized)) return true;
  const parts = normalized.split('/');
  return parts.some((part) => part === '..');
}

function entryDepth(entryName: string): number {
  const normalized = entryName.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return 0;
  return normalized.split('/').filter(Boolean).length;
}

function isSymlinkEntry(entry: JSZip.JSZipObject): boolean {
  const unix = (entry as JSZip.JSZipObject & { unixPermissions?: number }).unixPermissions;
  if (typeof unix === 'number' && unix > 0) {
    return (unix & 0o170000) === 0o120000;
  }
  const dos = (entry as JSZip.JSZipObject & { dosPermissions?: number }).dosPermissions;
  // NTFS reparse / unused; treat high unix-like bits on dos as not symlink.
  void dos;
  return false;
}

/**
 * Safely extract a ZIP into destinationDir (must exist or will be created).
 * Rejects zip-slip, absolute paths, symlinks, and archive bombs by entry/size/depth.
 */
export async function safeExtractZip(options: SafeZipExtractOptions): Promise<{
  extractedRoot: string;
  entryCount: number;
  uncompressedBytes: number;
}> {
  const limits: BatchImportLimits = {
    ...BATCH_IMPORT_DEFAULT_LIMITS,
    ...options.limits,
  };
  assertNotAborted(options.signal);

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(options.zipPath);
  } catch (error) {
    throw new SafeZipExtractError(
      'ZIP_INVALID',
      error instanceof Error ? error.message : 'Failed to read ZIP',
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new SafeZipExtractError(
      'ZIP_INVALID',
      error instanceof Error ? error.message : 'Invalid ZIP archive',
    );
  }

  const entries = Object.values(zip.files);
  if (entries.length > limits.maxZipEntries) {
    throw new SafeZipExtractError(
      'ZIP_TOO_MANY_ENTRIES',
      `ZIP has ${entries.length} entries (limit ${limits.maxZipEntries})`,
    );
  }

  await fs.mkdir(options.destinationDir, { recursive: true });
  const destRoot = path.resolve(options.destinationDir);
  let uncompressedBytes = 0;
  let writtenFiles = 0;
  const total = entries.length;

  for (const entry of entries) {
    assertNotAborted(options.signal);
    const name = entry.name;
    options.onProgress?.(writtenFiles, total, name);

    if (!name || name.includes('\0') || isUnsafeZipPath(name)) {
      const code = name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)
        ? 'ZIP_ABSOLUTE_PATH'
        : 'ZIP_TRAVERSAL';
      throw new SafeZipExtractError(
        code,
        `ZIP entry has unsafe path: ${name}`,
      );
    }
    if (entryDepth(name) > limits.maxDirectoryDepth) {
      throw new SafeZipExtractError(
        'ZIP_DEPTH_EXCEEDED',
        `ZIP entry depth exceeds ${limits.maxDirectoryDepth}: ${name}`,
      );
    }
    if (isSymlinkEntry(entry)) {
      throw new SafeZipExtractError(
        'ZIP_SYMLINK',
        `ZIP contains symlink (blocked): ${name}`,
      );
    }

    const targetPath = path.resolve(destRoot, name);
    if (targetPath !== destRoot && !targetPath.startsWith(`${destRoot}${path.sep}`)) {
      throw new SafeZipExtractError(
        'ZIP_TRAVERSAL',
        `ZIP entry resolves outside destination: ${name}`,
      );
    }

    if (entry.dir) {
      assertNotAborted(options.signal);
      await fs.mkdir(targetPath, { recursive: true });
      writtenFiles += 1;
      continue;
    }

    const data = await entry.async('nodebuffer');
    assertNotAborted(options.signal);
    if (data.byteLength > limits.maxSingleEntryBytes) {
      throw new SafeZipExtractError(
        'ZIP_ENTRY_TOO_LARGE',
        `ZIP entry too large (${data.byteLength} bytes): ${name}`,
      );
    }
    uncompressedBytes += data.byteLength;
    if (uncompressedBytes > limits.maxUncompressedBytes) {
      throw new SafeZipExtractError(
        'ZIP_UNCOMPRESSED_TOO_LARGE',
        `ZIP uncompressed size exceeds ${limits.maxUncompressedBytes} bytes`,
      );
    }

    assertNotAborted(options.signal);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    assertNotAborted(options.signal);
    await fs.writeFile(targetPath, data);
    writtenFiles += 1;

    // Yield to event loop for large archives
    if (writtenFiles % 25 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  options.onProgress?.(writtenFiles, total, '');
  return {
    extractedRoot: destRoot,
    entryCount: writtenFiles,
    uncompressedBytes,
  };
}
