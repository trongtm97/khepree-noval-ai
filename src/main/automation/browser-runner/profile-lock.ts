import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PROFILE_LEASE_FILENAME,
  PROFILE_LEASE_HEARTBEAT_MS,
  PROFILE_LEASE_TTL_MS,
  defaultLeaseLabel,
  type ProfileLeaseMeta,
  type ProfileLeaseOperation,
} from '@shared/constants/profile-lease';

/** Stable per app/process lifetime — distinguishes two NovelTrans instances. */
export const PROCESS_INSTANCE_ID = randomUUID();

export class ProfileBusyError extends Error {
  readonly code = 'PROFILE_BUSY' as const;
  readonly lease: ProfileLeaseMeta;

  constructor(lease: ProfileLeaseMeta) {
    super(
      `PROFILE_BUSY: Profile đang được sử dụng bởi: ${lease.label || defaultLeaseLabel(lease.operation)}`,
    );
    this.name = 'ProfileBusyError';
    this.lease = lease;
  }
}

export interface AcquireLeaseInput {
  profilePath: string;
  ownerId: string;
  accountId: string;
  operation: ProfileLeaseOperation;
  label?: string;
  ttlMs?: number;
  /** Test override — default process.pid */
  pid?: number;
  /** Test override — default PROCESS_INSTANCE_ID */
  processInstanceId?: string;
  now?: () => number;
}

export interface AcquireLeaseResult {
  lease: ProfileLeaseMeta;
  recoveredStale: boolean;
  nested: boolean;
}

export interface RenewLeaseInput {
  profilePath: string;
  ownerId: string;
  ttlMs?: number;
  now?: () => number;
}

type HeldLease = {
  ownerId: string;
  lockPath: string;
  lease: ProfileLeaseMeta;
};

function lockFilePath(profilePath: string): string {
  return path.join(path.resolve(profilePath), PROFILE_LEASE_FILENAME);
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLeaseFile(lockPath: string): ProfileLeaseMeta | null {
  try {
    if (!fs.existsSync(lockPath)) return null;
    const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<ProfileLeaseMeta>;
    if (
      typeof raw.ownerId !== 'string' ||
      typeof raw.pid !== 'number' ||
      typeof raw.expiresAt !== 'string'
    ) {
      return null;
    }
    return {
      profilePath: typeof raw.profilePath === 'string' ? raw.profilePath : '',
      ownerId: raw.ownerId,
      accountId: typeof raw.accountId === 'string' ? raw.accountId : 'unknown',
      operation: (raw.operation as ProfileLeaseOperation) || 'legacy',
      pid: raw.pid,
      processInstanceId:
        typeof raw.processInstanceId === 'string' ? raw.processInstanceId : 'unknown',
      acquiredAt: typeof raw.acquiredAt === 'string' ? raw.acquiredAt : new Date(0).toISOString(),
      heartbeatAt:
        typeof raw.heartbeatAt === 'string' ? raw.heartbeatAt : new Date(0).toISOString(),
      expiresAt: raw.expiresAt,
      label:
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label
          : defaultLeaseLabel((raw.operation as ProfileLeaseOperation) || 'legacy'),
    };
  } catch {
    return null;
  }
}

function writeLeaseExclusive(lockPath: string, lease: ProfileLeaseMeta): boolean {
  const body = `${JSON.stringify(lease, null, 2)}\n`;
  try {
    fs.writeFileSync(lockPath, body, { flag: 'wx' });
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return false;
    // Windows may not support 'wx' on all FS — fall back to check+write carefully.
    if (code === 'ERR_INVALID_ARG_VALUE' || code === 'EINVAL') {
      if (fs.existsSync(lockPath)) return false;
      fs.writeFileSync(lockPath, body, 'utf8');
      return true;
    }
    throw error;
  }
}

function overwriteLease(lockPath: string, lease: ProfileLeaseMeta): void {
  fs.writeFileSync(lockPath, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
}

/**
 * Process-aware profile lease lock.
 * Never blindly deletes a lock just because this service lacks in-memory ownership.
 */
export class ProfileLeaseLockManager {
  private readonly held = new Map<string, HeldLease>();

  /** @deprecated Prefer acquireLease — kept for gradual migration / tests. */
  acquire(profilePath: string, ownerId: string): void {
    this.acquireLease({
      profilePath,
      ownerId,
      accountId: 'unknown',
      operation: 'legacy',
    });
  }

  acquireLease(input: AcquireLeaseInput): AcquireLeaseResult {
    const nowFn = input.now ?? Date.now;
    const normalized = path.resolve(input.profilePath);
    const lockPath = lockFilePath(normalized);
    fs.mkdirSync(normalized, { recursive: true });

    const existingHeld = this.held.get(normalized);
    if (existingHeld) {
      if (existingHeld.ownerId === input.ownerId) {
        const renewed = this.renewLease({
          profilePath: normalized,
          ownerId: input.ownerId,
          ttlMs: input.ttlMs,
          now: nowFn,
        });
        return { lease: renewed, recoveredStale: false, nested: true };
      }
      throw new ProfileBusyError(existingHeld.lease);
    }

    let recoveredStale = false;
    const disk = readLeaseFile(lockPath);
    if (disk) {
      const recovered = this.recoverIfStale(normalized, nowFn());
      if (!recovered) {
        const fresh = readLeaseFile(lockPath) ?? disk;
        throw new ProfileBusyError(fresh);
      }
      recoveredStale = true;
    }

    const ttl = input.ttlMs ?? PROFILE_LEASE_TTL_MS;
    const now = nowFn();
    const lease: ProfileLeaseMeta = {
      profilePath: normalized,
      ownerId: input.ownerId,
      accountId: input.accountId,
      operation: input.operation,
      pid: input.pid ?? process.pid,
      processInstanceId: input.processInstanceId ?? PROCESS_INSTANCE_ID,
      acquiredAt: new Date(now).toISOString(),
      heartbeatAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      label: input.label?.trim() || defaultLeaseLabel(input.operation),
    };

    if (!writeLeaseExclusive(lockPath, lease)) {
      // Race: another process created the lock between recover and write.
      const raced = this.recoverIfStale(normalized, nowFn());
      if (!raced) {
        const other = readLeaseFile(lockPath);
        if (other) throw new ProfileBusyError(other);
        throw new ProfileBusyError(lease);
      }
      if (!writeLeaseExclusive(lockPath, lease)) {
        const other = readLeaseFile(lockPath);
        throw new ProfileBusyError(other ?? lease);
      }
      recoveredStale = true;
    }

    this.held.set(normalized, { ownerId: input.ownerId, lockPath, lease });
    return { lease, recoveredStale, nested: false };
  }

  renewLease(input: RenewLeaseInput): ProfileLeaseMeta {
    const nowFn = input.now ?? Date.now;
    const normalized = path.resolve(input.profilePath);
    const held = this.held.get(normalized);
    if (!held) {
      throw new Error(`No local lease to renew for ${normalized}`);
    }
    if (held.ownerId !== input.ownerId) {
      throw new Error('Cannot renew profile lease owned by another worker');
    }

    const ttl = input.ttlMs ?? PROFILE_LEASE_TTL_MS;
    const now = nowFn();
    const next: ProfileLeaseMeta = {
      ...held.lease,
      heartbeatAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
    };
    overwriteLease(held.lockPath, next);
    held.lease = next;
    return next;
  }

  releaseLease(profilePath: string, ownerId: string): void {
    const normalized = path.resolve(profilePath);
    const held = this.held.get(normalized);
    if (!held) {
      return;
    }
    if (held.ownerId !== ownerId) {
      throw new Error('Cannot release profile lease owned by another worker');
    }
    if (fs.existsSync(held.lockPath)) {
      fs.unlinkSync(held.lockPath);
    }
    this.held.delete(normalized);
  }

  /** @deprecated Prefer releaseLease */
  release(profilePath: string, ownerId: string): void {
    this.releaseLease(profilePath, ownerId);
  }

  /**
   * Recover lock if PID is dead or lease expired.
   * Returns true when lock file was removed (or absent).
   */
  recoverIfStale(profilePath: string, nowMs = Date.now()): boolean {
    const normalized = path.resolve(profilePath);
    const lockPath = lockFilePath(normalized);
    const disk = readLeaseFile(lockPath);
    if (!disk) {
      this.held.delete(normalized);
      return true;
    }

    const expired = Date.parse(disk.expiresAt) <= nowMs;
    const alive = isProcessAlive(disk.pid);
    const sameInstance = disk.processInstanceId === PROCESS_INSTANCE_ID;
    const heldLocally = this.held.has(normalized);

    // Live foreign (or local) lease with fresh expiry → keep.
    if (alive && !expired) {
      return false;
    }

    // Same process instance still tracks it as held and PID alive → not stale
    // even if clock skew made expiresAt look old (heartbeat should renew).
    if (heldLocally && sameInstance && alive && !expired) {
      return false;
    }

    // Dead PID or expired → safe to clear disk + drop local map if matching.
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    this.held.delete(normalized);
    return true;
  }

  /**
   * Startup / sweep: recover stale leases under browser-profiles root.
   * Does NOT delete valid live leases.
   */
  recoverStaleUnder(profilesRoot: string, nowMs = Date.now()): number {
    if (!fs.existsSync(profilesRoot)) return 0;
    let cleared = 0;
    for (const entry of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const profilePath = path.join(profilesRoot, entry.name);
      const before = fs.existsSync(lockFilePath(profilePath));
      if (!before) continue;
      if (this.recoverIfStale(profilePath, nowMs)) {
        cleared += 1;
      }
    }
    return cleared;
  }

  /** @deprecated Use recoverStaleUnder — never force-clears live leases. */
  clearOrphanLocksUnder(profilesRoot: string): number {
    return this.recoverStaleUnder(profilesRoot);
  }

  getOwner(profilePath: string): string | null {
    const normalized = path.resolve(profilePath);
    const held = this.held.get(normalized);
    if (held) return held.ownerId;
    const disk = readLeaseFile(lockFilePath(normalized));
    if (!disk) return null;
    if (!this.recoverIfStale(normalized)) {
      return disk.ownerId;
    }
    return null;
  }

  getLease(profilePath: string): ProfileLeaseMeta | null {
    const normalized = path.resolve(profilePath);
    const held = this.held.get(normalized);
    if (held) return { ...held.lease };
    const disk = readLeaseFile(lockFilePath(normalized));
    if (!disk) return null;
    if (!this.recoverIfStale(normalized)) {
      return disk;
    }
    return null;
  }

  isLocked(profilePath: string): boolean {
    return this.getLease(profilePath) != null;
  }

  isHeldByJob(profilePath: string, jobId: string | null | undefined): boolean {
    if (!jobId) return false;
    const owner = this.getOwner(profilePath);
    return owner != null && owner.startsWith(`job:${jobId}:`);
  }

  isHeldByRuntime(profilePath: string, accountId: string): boolean {
    const owner = this.getOwner(profilePath);
    return owner === `runtime:${accountId}`;
  }

  canNestLaunch(
    profilePath: string,
    options: { accountId: string; jobId?: string | null },
  ): boolean {
    if (this.isHeldByRuntime(profilePath, options.accountId)) return true;
    if (this.isHeldByJob(profilePath, options.jobId)) return true;
    return false;
  }

  listActiveLeases(): ProfileLeaseMeta[] {
    const out: ProfileLeaseMeta[] = [];
    for (const held of this.held.values()) {
      out.push({ ...held.lease });
    }
    return out;
  }
}

/** @deprecated Alias — use ProfileLeaseLockManager */
export type ProfileLockManager = ProfileLeaseLockManager;
/** @deprecated Alias */
export const ProfileLockManager = ProfileLeaseLockManager;

export const profileLockManager = new ProfileLeaseLockManager();

/**
 * Heartbeat while translation / preprocess / notebook / manual browser runs.
 * Returns a stop() function.
 */
export function startLeaseHeartbeat(
  manager: ProfileLeaseLockManager,
  input: { profilePath: string; ownerId: string; intervalMs?: number; ttlMs?: number },
): () => void {
  const intervalMs = input.intervalMs ?? PROFILE_LEASE_HEARTBEAT_MS;
  const timer = setInterval(() => {
    try {
      manager.renewLease({
        profilePath: input.profilePath,
        ownerId: input.ownerId,
        ttlMs: input.ttlMs,
      });
    } catch {
      // Owner released or process shutting down.
    }
  }, intervalMs);
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref?.();
  }
  return () => clearInterval(timer);
}

export async function withLeaseHeartbeat<T>(
  manager: ProfileLeaseLockManager,
  input: { profilePath: string; ownerId: string; intervalMs?: number; ttlMs?: number },
  fn: () => Promise<T>,
): Promise<T> {
  const stop = startLeaseHeartbeat(manager, input);
  try {
    return await fn();
  } finally {
    stop();
  }
}
