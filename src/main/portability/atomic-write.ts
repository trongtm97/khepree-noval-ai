import fs from 'node:fs';
import path from 'node:path';

/** Write file atomically via temp + rename so partial writes never corrupt targets. */
export function writeFileAtomic(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, data);
    const expected = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    const actual = fs.statSync(tmp).size;
    if (actual !== expected) {
      throw new Error(`ATOMIC_WRITE_SIZE_MISMATCH:${actual}!=${expected}`);
    }
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw error;
  }
}
