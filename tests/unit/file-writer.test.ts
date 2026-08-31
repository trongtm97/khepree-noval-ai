import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileWriter } from '../../src/main/logging/file-writer';

describe('FileWriter rotation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'khepree-novel-ai-log-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes log lines to file', () => {
    const writer = new FileWriter({ logDir: tempDir, fileName: 'test.log' });
    writer.write('{"level":"info","message":"hello"}');

    const content = fs.readFileSync(path.join(tempDir, 'test.log'), 'utf8');
    expect(content).toContain('hello');
  });

  it('rotates log file when max size exceeded', () => {
    const writer = new FileWriter({
      logDir: tempDir,
      fileName: 'rotate.log',
      maxBytes: 50,
      maxFiles: 3,
    });

    writer.write('x'.repeat(40));
    writer.write('y'.repeat(40));
    writer.write('z'.repeat(40));

    expect(fs.existsSync(path.join(tempDir, 'rotate.log.1'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'rotate.log'))).toBe(true);
  });
});
