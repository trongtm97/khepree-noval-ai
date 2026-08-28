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
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}
