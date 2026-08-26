import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserEventLogger } from '@main/automation/browser-event-logger';

describe('BrowserEventLogger', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps logging to file when DB insert hits FOREIGN KEY', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-evt-'));
    dirs.push(dir);
    const insert = vi.fn(() => {
      throw new Error('FOREIGN KEY constraint failed');
    });
    const logger = new BrowserEventLogger({ insert } as never, dir);

    expect(() =>
      logger.log(null, {
        eventType: 'submit',
        workerId: 'not-a-worker-state-id',
        correlationId: 'corr-1',
      }),
    ).not.toThrow();

    expect(insert).toHaveBeenCalledOnce();
    const jsonl = fs.readFileSync(path.join(dir, 'browser-events.jsonl'), 'utf8');
    expect(jsonl).toContain('submit');
    expect(jsonl).toContain('corr-1');
  });
});
