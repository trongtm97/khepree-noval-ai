import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProfileBusyError,
  ProfileLeaseLockManager,
  PROCESS_INSTANCE_ID,
  isProcessAlive,
} from '@main/automation/browser-runner/profile-lock';
import { PROFILE_LEASE_FILENAME } from '@shared/constants/profile-lease';

describe('ProfileLeaseLockManager', () => {
  let tempRoot: string;
  let profilePath: string;
  let locks: ProfileLeaseLockManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-lease-'));
    profilePath = path.join(tempRoot, 'profile');
    fs.mkdirSync(profilePath, { recursive: true });
    locks = new ProfileLeaseLockManager();
  });

  afterEach(() => {
    try {
      locks.releaseLease(profilePath, 'owner-a');
    } catch {
      locks.recoverIfStale(profilePath, Date.now() + 10_000_000);
    }
    try {
      locks.releaseLease(profilePath, 'owner-b');
    } catch {
      // ignore
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('valid live lock is not cleared by recoverIfStale', () => {
    locks.acquireLease({
      profilePath,
      ownerId: 'owner-a',
      accountId: 'acct-1',
      operation: 'translation',
      label: 'Dịch chương 51–53',
    });
    expect(locks.recoverIfStale(profilePath)).toBe(false);
    expect(locks.isLocked(profilePath)).toBe(true);
    expect(locks.getLease(profilePath)?.label).toBe('Dịch chương 51–53');
  });

  it('dead PID lease is recovered', () => {
    const lockPath = path.join(profilePath, PROFILE_LEASE_FILENAME);
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        profilePath,
        ownerId: 'dead-owner',
        accountId: 'acct-1',
        operation: 'translation',
        pid: 2_147_483_647,
        processInstanceId: 'other-instance',
        acquiredAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        label: 'Dịch chương 51–53',
      }),
      'utf8',
    );
    expect(isProcessAlive(2_147_483_647)).toBe(false);
    expect(locks.recoverIfStale(profilePath)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);

    locks.acquireLease({
      profilePath,
      ownerId: 'owner-a',
      accountId: 'acct-1',
      operation: 'manual_browser',
    });
    expect(locks.getOwner(profilePath)).toBe('owner-a');
  });

  it('expired lease is recovered even if PID looks alive', () => {
    const lockPath = path.join(profilePath, PROFILE_LEASE_FILENAME);
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        profilePath,
        ownerId: 'expired-owner',
        accountId: 'acct-1',
        operation: 'translation',
        pid: process.pid,
        processInstanceId: 'other-instance',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        heartbeatAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 30_000).toISOString(),
        label: 'Expired op',
      }),
      'utf8',
    );
    expect(locks.recoverIfStale(profilePath, Date.now())).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('two managers race — one wins, other gets PROFILE_BUSY', () => {
    const a = new ProfileLeaseLockManager();
    const b = new ProfileLeaseLockManager();
    a.acquireLease({
      profilePath,
      ownerId: 'owner-a',
      accountId: 'acct-1',
      operation: 'translation',
      label: 'Dịch chương 51–53',
    });
    expect(() =>
      b.acquireLease({
        profilePath,
        ownerId: 'owner-b',
        accountId: 'acct-2',
        operation: 'manual_browser',
      }),
    ).toThrow(ProfileBusyError);

    try {
      b.acquireLease({
        profilePath,
        ownerId: 'owner-b',
        accountId: 'acct-2',
        operation: 'manual_browser',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProfileBusyError);
      const busy = error as ProfileBusyError;
      expect(busy.code).toBe('PROFILE_BUSY');
      expect(busy.lease.label).toContain('Dịch chương');
      expect(busy.message).toMatch(/Profile đang được sử dụng bởi/);
    }

    a.releaseLease(profilePath, 'owner-a');
    b.acquireLease({
      profilePath,
      ownerId: 'owner-b',
      accountId: 'acct-2',
      operation: 'manual_browser',
    });
    b.releaseLease(profilePath, 'owner-b');
  });

  it('release wrong owner is rejected', () => {
    locks.acquireLease({
      profilePath,
      ownerId: 'owner-a',
      accountId: 'acct-1',
      operation: 'translation',
    });
    expect(() => locks.releaseLease(profilePath, 'owner-b')).toThrow(/another worker/i);
    locks.releaseLease(profilePath, 'owner-a');
  });

  it('renewLease extends expiresAt', () => {
    const now = Date.now();
    locks.acquireLease({
      profilePath,
      ownerId: 'owner-a',
      accountId: 'acct-1',
      operation: 'translation',
      ttlMs: 1_000,
      now: () => now,
    });
    const before = locks.getLease(profilePath)!;
    const renewed = locks.renewLease({
      profilePath,
      ownerId: 'owner-a',
      ttlMs: 5_000,
      now: () => now + 100,
    });
    expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.parse(before.expiresAt));
  });

  it('isHeldByJob / isHeldByRuntime nesting helpers', () => {
    locks.acquireLease({
      profilePath,
      ownerId: `job:abc:sched-1`,
      accountId: 'acct-1',
      operation: 'translation',
    });
    expect(locks.isHeldByJob(profilePath, 'abc')).toBe(true);
    expect(locks.canNestLaunch(profilePath, { accountId: 'acct-1', jobId: 'abc' })).toBe(
      true,
    );
    locks.releaseLease(profilePath, `job:abc:sched-1`);

    locks.acquireLease({
      profilePath,
      ownerId: `runtime:acct-1`,
      accountId: 'acct-1',
      operation: 'runtime',
    });
    expect(locks.isHeldByRuntime(profilePath, 'acct-1')).toBe(true);
    locks.releaseLease(profilePath, `runtime:acct-1`);
  });

  it('startup recoverStaleUnder only clears dead/expired', () => {
    locks.acquireLease({
      profilePath,
      ownerId: 'owner-a',
      accountId: 'acct-1',
      operation: 'translation',
    });
    const deadProfile = path.join(tempRoot, 'dead-profile');
    fs.mkdirSync(deadProfile, { recursive: true });
    fs.writeFileSync(
      path.join(deadProfile, PROFILE_LEASE_FILENAME),
      JSON.stringify({
        profilePath: deadProfile,
        ownerId: 'ghost',
        accountId: 'x',
        operation: 'legacy',
        pid: 2_147_483_646,
        processInstanceId: 'other',
        acquiredAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        label: 'ghost',
      }),
      'utf8',
    );

    const cleared = locks.recoverStaleUnder(tempRoot);
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect(locks.isLocked(profilePath)).toBe(true);
    expect(fs.existsSync(path.join(deadProfile, PROFILE_LEASE_FILENAME))).toBe(false);
    expect(PROCESS_INSTANCE_ID).toBeTruthy();
  });
});
