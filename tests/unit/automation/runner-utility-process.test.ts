import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  buildRunnerPathCandidates,
  resolveRunnerScriptPath,
} from '../../../src/main/automation/browser-runner/runner-path';
import {
  parseRunnerChildToHostMessage,
  parseRunnerRequestMessage,
  RunnerRequestMessageSchema,
  RunnerChildToHostMessageSchema,
} from '../../../src/main/automation/protocol';

describe('runner path resolution', () => {
  it('lists primary then asar.unpacked candidates', () => {
    const dirname = 'C:\\App\\resources\\app.asar\\.vite\\build';
    const candidates = buildRunnerPathCandidates(dirname);
    expect(candidates[0]).toContain(`app.asar${path.sep}.vite${path.sep}build${path.sep}runner-entry.js`);
    expect(candidates.some((c) => c.includes('app.asar.unpacked'))).toBe(true);
  });

  it('resolveRunnerScriptPath returns a string ending with runner-entry.js', () => {
    const resolved = resolveRunnerScriptPath(
      'D:\\fake\\app.asar\\.vite\\build',
    );
    expect(resolved.endsWith('runner-entry.js')).toBe(true);
  });
});

describe('utilityProcess runner protocol', () => {
  it('parses typed request with requestId + command', () => {
    const msg = parseRunnerRequestMessage({
      type: 'request',
      requestId: 'req-1',
      command: {
        id: 'req-1',
        type: 'GET_STATUS',
      },
    });
    expect(msg.requestId).toBe('req-1');
    expect(msg.command.type).toBe('GET_STATUS');
  });

  it('parses response with result', () => {
    const msg = parseRunnerChildToHostMessage({
      type: 'response',
      requestId: 'req-1',
      result: {
        id: 'req-1',
        ok: true,
        state: 'READY',
      },
    });
    expect(msg.type).toBe('response');
    if (msg.type === 'response') {
      expect(msg.result?.ok).toBe(true);
    }
  });

  it('parses response with error', () => {
    const msg = RunnerChildToHostMessageSchema.parse({
      type: 'response',
      requestId: 'req-2',
      error: { message: 'crashed', code: 'UNKNOWN_UI' },
    });
    expect(msg.type).toBe('response');
    if (msg.type === 'response') {
      expect(msg.error?.message).toBe('crashed');
    }
  });

  it('parses runner_ready event', () => {
    const msg = parseRunnerChildToHostMessage({
      type: 'event',
      event: 'runner_ready',
      payload: { pid: 123 },
    });
    expect(msg.type).toBe('event');
  });

  it('rejects untyped legacy stdio-only shapes as request', () => {
    expect(() =>
      RunnerRequestMessageSchema.parse({
        id: '1',
        type: 'OPEN',
        profilePath: 'C:/x',
      }),
    ).toThrow();
  });
});
