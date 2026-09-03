import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

/**
 * Copy a file or directory tree into durableRoot (must not exist or will be replaced).
 * Used to persist ZIP-extracted novels before temp cleanup.
 */
export async function copyPathToDurable(
  sourcePath: string,
  durablePath: string,
): Promise<void> {
  await fsPromises.rm(durablePath, { recursive: true, force: true });
  await fsPromises.mkdir(path.dirname(durablePath), { recursive: true });
  const stat = await fsPromises.stat(sourcePath);
  if (stat.isDirectory()) {
    await copyDirRecursive(sourcePath, durablePath);
  } else {
    await fsPromises.copyFile(sourcePath, durablePath);
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(from, to);
    } else if (entry.isFile()) {
      await fsPromises.copyFile(from, to);
    }
    // skip symlinks — never follow out of extract tree
  }
}

export function isPathInside(parent: string, child: string): boolean {
  const base = path.resolve(parent);
  const target = path.resolve(child);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

export function assertExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Source path missing: ${filePath}`);
  }
}
