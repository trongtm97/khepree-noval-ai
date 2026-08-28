import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCsvRows } from '@main/tabular/csv-utils';

const RUN_PERF = process.env.TABULAR_PERF === '1';

describe.skipIf(!RUN_PERF)('tabular performance', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses 100k CSV rows under 15s', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-tabular-perf-'));
    const lines = ['source_text,preferred_translation'];
    for (let i = 0; i < 100_000; i += 1) {
      lines.push(`词${i},term ${i}`);
    }
    const text = lines.join('\n');
    const start = performance.now();
    const rows = parseCsvRows(text, ',');
    const elapsed = performance.now() - start;
    expect(rows.length).toBe(100_000);
    expect(elapsed).toBeLessThan(15_000);
  });
});
