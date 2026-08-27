import { describe, expect, it } from 'vitest';
import {
  parseLsofListeningPids,
  parseWindowsNetstatListeningPids,
} from '@main/ai/worker-process-manager';

describe('worker port reclaim parsers', () => {
  it('parseWindowsNetstatListeningPids finds LISTENING pid for port', () => {
    const output = `
  TCP    127.0.0.1:18765        0.0.0.0:0              LISTENING       26232
  TCP    127.0.0.1:18765        127.0.0.1:64689        ESTABLISHED     26232
  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
  TCP    127.0.0.1:187650       0.0.0.0:0              LISTENING       99
`;
    expect(parseWindowsNetstatListeningPids(output, 18765)).toEqual([26232]);
  });

  it('parseWindowsNetstatListeningPids ignores non-listening rows', () => {
    const output = `
  TCP    127.0.0.1:18765        127.0.0.1:1            TIME_WAIT       0
  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       111
`;
    expect(parseWindowsNetstatListeningPids(output, 18765)).toEqual([]);
  });

  it('parseLsofListeningPids reads pid lines', () => {
    expect(parseLsofListeningPids('1234\n5678\n\n')).toEqual([1234, 5678]);
  });
});
