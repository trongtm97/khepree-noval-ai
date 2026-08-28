import fs from 'node:fs';
import path from 'node:path';

export type DirectoryValidationError =
  | 'NOT_FOUND'
  | 'NOT_DIRECTORY'
  | 'NOT_WRITABLE'
  | 'INACCESSIBLE';

export interface DirectoryValidationResult {
  valid: boolean;
  path: string;
  error?: DirectoryValidationError;
}

/** Validate export directory exists, is a folder, and is writable. */
export function validateExportDirectory(
  directory: string,
  options?: { create?: boolean },
): DirectoryValidationResult {
  const normalized = path.resolve(directory.trim());
  try {
    if (!fs.existsSync(normalized)) {
      if (options?.create) {
        fs.mkdirSync(normalized, { recursive: true });
      } else {
        return { valid: false, path: normalized, error: 'NOT_FOUND' };
      }
    }
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return { valid: false, path: normalized, error: 'NOT_DIRECTORY' };
    }
    const probe = path.join(normalized, `.noveltrans-write-probe-${process.pid}`);
    try {
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
    } catch {
      return { valid: false, path: normalized, error: 'NOT_WRITABLE' };
    }
    return { valid: true, path: normalized };
  } catch {
    return { valid: false, path: normalized, error: 'INACCESSIBLE' };
  }
}
