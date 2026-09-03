import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { SafeZipExtractError, safeExtractZip } from '@main/batch-import/safe-zip-extract';

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function writeZip(
  filePath: string,
  build: (zip: JSZip) => void,
  generateOptions?: { platform?: 'UNIX' | 'DOS' },
): Promise<void> {
  const zip = new JSZip();
  build(zip);
  const buf = await zip.generateAsync({ type: 'nodebuffer', ...generateOptions });
  fs.writeFileSync(filePath, buf);
}

describe('safeExtractZip', () => {
  it('extracts a normal nested novel folder', async () => {
    const root = tmp('zip-ok-');
    const zipPath = path.join(root, 'ok.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      zip.file('Novel/1.txt', '第一章\nhello');
    });
    const result = await safeExtractZip({ zipPath, destinationDir: dest });
    expect(fs.existsSync(path.join(result.extractedRoot, 'Novel', '1.txt'))).toBe(true);
  });

  it('rejects zip-slip traversal', async () => {
    const root = tmp('zip-slip-');
    const zipPath = path.join(root, 'bad.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      zip.file('../outside.txt', 'pwn');
    });
    await expect(safeExtractZip({ zipPath, destinationDir: dest })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SafeZipExtractError &&
        (err.code === 'ZIP_TRAVERSAL' || err.code === 'ZIP_ABSOLUTE_PATH'),
    );
    expect(fs.existsSync(path.join(root, 'outside.txt'))).toBe(false);
  });

  it('rejects absolute paths', async () => {
    const root = tmp('zip-abs-');
    const zipPath = path.join(root, 'abs.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      zip.file('/tmp/evil.txt', 'nope');
    });
    await expect(safeExtractZip({ zipPath, destinationDir: dest })).rejects.toBeInstanceOf(
      SafeZipExtractError,
    );
  });

  it('rejects symlink entries', async () => {
    const root = tmp('zip-link-');
    const zipPath = path.join(root, 'link.zip');
    const dest = path.join(root, 'out');
    await writeZip(
      zipPath,
      (zip) => {
        zip.file('link', 'target', { unixPermissions: 0o120777 });
      },
      { platform: 'UNIX' },
    );
    await expect(safeExtractZip({ zipPath, destinationDir: dest })).rejects.toMatchObject({
      code: 'ZIP_SYMLINK',
    });
  });

  it('rejects too many entries', async () => {
    const root = tmp('zip-many-');
    const zipPath = path.join(root, 'many.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      for (let i = 0; i < 8; i += 1) zip.file(`f${i}.txt`, 'x');
    });
    await expect(
      safeExtractZip({
        zipPath,
        destinationDir: dest,
        limits: { maxZipEntries: 3 },
      }),
    ).rejects.toMatchObject({ code: 'ZIP_TOO_MANY_ENTRIES' });
  });

  it('rejects oversized uncompressed entry', async () => {
    const root = tmp('zip-big-');
    const zipPath = path.join(root, 'big.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      zip.file('huge.txt', 'abcdefghij');
    });
    await expect(
      safeExtractZip({
        zipPath,
        destinationDir: dest,
        limits: { maxSingleEntryBytes: 4 },
      }),
    ).rejects.toMatchObject({ code: 'ZIP_ENTRY_TOO_LARGE' });
  });

  it('rejects excessive directory depth', async () => {
    const root = tmp('zip-deep-');
    const zipPath = path.join(root, 'deep.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      zip.file('a/b/c/d/e.txt', 'x');
    });
    await expect(
      safeExtractZip({
        zipPath,
        destinationDir: dest,
        limits: { maxDirectoryDepth: 3 },
      }),
    ).rejects.toMatchObject({ code: 'ZIP_DEPTH_EXCEEDED' });
  });

  it('stops on abort and does not throw zip-slip after cancel', async () => {
    const root = tmp('zip-abort-');
    const zipPath = path.join(root, 'a.zip');
    const dest = path.join(root, 'out');
    await writeZip(zipPath, (zip) => {
      zip.file('n/1.txt', 'ok');
    });
    const ac = new AbortController();
    ac.abort();
    await expect(
      safeExtractZip({ zipPath, destinationDir: dest, signal: ac.signal }),
    ).rejects.toMatchObject({ code: 'ZIP_CANCELLED' });
  });
});
