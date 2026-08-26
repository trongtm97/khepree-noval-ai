import { describe, expect, it, vi } from 'vitest';
import { healIdleWorkers } from '@main/jobs/heal-workers';
import type { DatabaseManager } from '@main/db/database-manager';

function mockDb(workers: Array<Record<string, unknown>>, jobs: Map<string, { state: string }>) {
  const markReady = vi.fn((id: string) => {
    const w = workers.find((row) => row.id === id);
    if (w) {
      w.health = 'READY';
      w.current_job_id = null;
    }
    return w ?? null;
  });
  return {
    workerStates: {
      listAll: () => workers,
      markReady,
    },
    googleAccounts: {
      getById: (id: string) =>
        workers.some((w) => w.google_account_id === id)
          ? { id, status: 'READY', email: 'a@x.com', drive_connected: 1 }
          : null,
    },
    jobs: {
      getById: (id: string) => jobs.get(id) ?? null,
    },
  } as unknown as DatabaseManager;
}

describe('healIdleWorkers', () => {
  it('heals BUSY with no current_job_id', () => {
    const workers = [
      {
        id: 'w1',
        google_account_id: 'a1',
        health: 'BUSY',
        current_job_id: null,
      },
    ];
    const db = mockDb(workers, new Map());
    expect(healIdleWorkers(db)).toBe(1);
    expect(workers[0]!.health).toBe('READY');
  });

  it('heals BUSY when linked job is terminal', () => {
    const workers = [
      {
        id: 'w1',
        google_account_id: 'a1',
        health: 'BUSY',
        current_job_id: 'j1',
      },
    ];
    const db = mockDb(workers, new Map([['j1', { state: 'NEEDS_ATTENTION' }]]));
    expect(healIdleWorkers(db)).toBe(1);
    expect(workers[0]!.health).toBe('READY');
  });

  it('does not heal BUSY while job still SENDING', () => {
    const workers = [
      {
        id: 'w1',
        google_account_id: 'a1',
        health: 'BUSY',
        current_job_id: 'j1',
      },
    ];
    const db = mockDb(workers, new Map([['j1', { state: 'SENDING' }]]));
    expect(healIdleWorkers(db)).toBe(0);
    expect(workers[0]!.health).toBe('BUSY');
  });

  it('heals stale NEEDS_ATTENTION when account READY', () => {
    const workers = [
      {
        id: 'w1',
        google_account_id: 'a1',
        health: 'NEEDS_ATTENTION',
        current_job_id: null,
      },
    ];
    const db = mockDb(workers, new Map());
    expect(healIdleWorkers(db)).toBe(1);
    expect(workers[0]!.health).toBe('READY');
  });
});
