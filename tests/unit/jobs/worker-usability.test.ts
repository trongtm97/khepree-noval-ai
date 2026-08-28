import { describe, expect, it } from 'vitest';
import {
  getUsableWorkerCount,
  isUsableWorker,
} from '../../../src/shared/utils/worker-usability';

describe('worker-usability', () => {
  const account = (id: string, status: string, workerEnabled = true) => ({
    id,
    status,
    workerEnabled,
  });

  it('counts READY worker with READY account', () => {
    const workers = [
      { id: 'w1', accountId: 'a1', health: 'READY', limitedUntil: null },
    ];
    const map = new Map([['a1', account('a1', 'READY')]]);
    expect(getUsableWorkerCount(workers, map)).toBe(1);
  });

  it('excludes BUSY worker', () => {
    const workers = [
      { id: 'w1', accountId: 'a1', health: 'BUSY', limitedUntil: null },
    ];
    const map = new Map([['a1', account('a1', 'BUSY')]]);
    expect(isUsableWorker(workers[0], map.get('a1'))).toBe(false);
    expect(getUsableWorkerCount(workers, map)).toBe(0);
  });

  it('excludes disabled account worker flag', () => {
    const workers = [
      { id: 'w1', accountId: 'a1', health: 'READY', limitedUntil: null },
    ];
    const map = new Map([['a1', account('a1', 'READY', false)]]);
    expect(getUsableWorkerCount(workers, map)).toBe(0);
  });

  it('excludes LOGIN_REQUIRED account', () => {
    const workers = [
      { id: 'w1', accountId: 'a1', health: 'READY', limitedUntil: null },
    ];
    const map = new Map([['a1', account('a1', 'LOGIN_REQUIRED')]]);
    expect(getUsableWorkerCount(workers, map)).toBe(0);
  });

  it('excludes active LIMITED cooldown', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const workers = [
      { id: 'w1', accountId: 'a1', health: 'LIMITED', limitedUntil: future },
    ];
    const map = new Map([['a1', account('a1', 'READY')]]);
    expect(getUsableWorkerCount(workers, map)).toBe(0);
  });
});
