import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileLeaseLockManager } from '@main/automation/browser-runner/profile-lock';

describe('ProfileLeaseLockManager job nesting', () => {
  let tempRoot: string;
  let profilePath: string;
  let locks: ProfileLeaseLockManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-plock-'));
    profilePath = path.join(tempRoot, 'profile');
    fs.mkdirSync(profilePath, { recursive: true });
    locks = new ProfileLeaseLockManager();
  });

  afterEach(() => {
    try {
      locks.releaseLease(profilePath, `job:job-abc:sched-1`);
    } catch {
      locks.recoverIfStale(profilePath, Date.now() + 10_000_000);
    }
    try {
      locks.releaseLease(profilePath, 'job:1:sched');
    } catch {
      // ignore
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('isHeldByJob true when BatchExecutor owns lock', () => {
    const jobId = 'job-abc';
    locks.acquireLease({
      profilePath,
      ownerId: `job:${jobId}:sched-1`,
      accountId: 'acct',
      operation: 'translation',
    });
    expect(locks.isHeldByJob(profilePath, jobId)).toBe(true);
    expect(locks.isHeldByJob(profilePath, 'other')).toBe(false);
    expect(locks.getOwner(profilePath)).toContain(jobId);
  });

  it('second acquire still throws for different owner', () => {
    locks.acquireLease({
      profilePath,
      ownerId: 'job:1:sched',
      accountId: 'acct',
      operation: 'translation',
    });
    expect(() =>
      locks.acquireLease({
        profilePath,
        ownerId: 'gemini-send:x',
        accountId: 'acct',
        operation: 'translation',
      }),
    ).toThrow(/PROFILE_BUSY|already in use|đang được sử dụng/i);
  });
});
