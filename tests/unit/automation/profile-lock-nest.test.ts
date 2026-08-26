import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileLockManager } from '@main/automation/browser-runner/profile-lock';

describe('ProfileLockManager job nesting', () => {
  let tempRoot: string;
  let profilePath: string;
  let locks: ProfileLockManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-plock-'));
    profilePath = path.join(tempRoot, 'profile');
    fs.mkdirSync(profilePath, { recursive: true });
    locks = new ProfileLockManager();
  });

  afterEach(() => {
    locks.forceClearStaleLock(profilePath);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('isHeldByJob true when BatchExecutor owns lock', () => {
    const jobId = 'job-abc';
    locks.acquire(profilePath, `job:${jobId}:sched-1`);
    expect(locks.isHeldByJob(profilePath, jobId)).toBe(true);
    expect(locks.isHeldByJob(profilePath, 'other')).toBe(false);
    expect(locks.getOwner(profilePath)).toContain(jobId);
  });

  it('second acquire still throws for different owner', () => {
    locks.acquire(profilePath, 'job:1:sched');
    expect(() => locks.acquire(profilePath, 'gemini-send:x')).toThrow(/already in use/i);
  });
});
