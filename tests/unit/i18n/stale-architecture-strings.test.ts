/**
 * Guard against stale Google Drive / legacy architecture strings in production UI.
 * Archived docs under docs/ are excluded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const STALE_PATTERNS = [
  'Google Drive OAuth',
  'drive.file',
  'Notebook Grounding Smoke',
  'worker đã kết nối Drive',
  'Drive-connected worker',
];

const SCAN_DIRS = [
  path.join(ROOT, 'src/renderer'),
  path.join(ROOT, 'src/shared'),
];

const SKIP_FILES = [/\.test\./, /legacy-drive-notice/, /035-legacy-drive/];

function collectFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(tsx?|json)$/.test(entry.name) && !SKIP_FILES.some((re) => re.test(full))) {
      out.push(full);
    }
  }
  return out;
}

describe('stale architecture string guard', () => {
  it('production renderer/shared sources omit removed Drive-era UI strings', () => {
    const hits: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of collectFiles(dir)) {
        const text = fs.readFileSync(file, 'utf8');
        for (const pattern of STALE_PATTERNS) {
          if (text.includes(pattern)) {
            hits.push(`${path.relative(ROOT, file)}: "${pattern}"`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
