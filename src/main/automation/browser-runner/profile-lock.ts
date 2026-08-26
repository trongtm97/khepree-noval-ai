import fs from 'node:fs';
import path from 'node:path';

/**
 * Prevents two Playwright instances from sharing the same userDataDir.
 * In-process Set + filesystem lock file.
 */
export class ProfileLockManager {
  private readonly locks = new Map<string, { owner: string; lockPath: string }>();

  acquire(profilePath: string, ownerId: string): void {
    const normalized = path.resolve(profilePath);
    const existing = this.locks.get(normalized);
    if (existing) {
      throw new Error(
        `Browser profile already in use by ${existing.owner}. Never open two Playwright instances on the same userDataDir.`,
      );
    }

    const lockPath = path.join(normalized, '.noveltrans.lock');
    fs.mkdirSync(normalized, { recursive: true });

    // Orphan lock from previous crash/quit — no in-memory owner in this process.
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }

    fs.writeFileSync(
      lockPath,
      JSON.stringify({ ownerId, acquiredAt: new Date().toISOString() }),
      'utf8',
    );
    this.locks.set(normalized, { owner: ownerId, lockPath });
  }

  getOwner(profilePath: string): string | null {
    return this.locks.get(path.resolve(profilePath))?.owner ?? null;
  }

  /**
   * True when BatchExecutor (or same job) already holds the profile lock.
   * Nested Playwright send must not re-acquire.
   */
  isHeldByJob(profilePath: string, jobId: string | null | undefined): boolean {
    if (!jobId) return false;
    const owner = this.getOwner(profilePath);
    return owner != null && owner.startsWith(`job:${jobId}:`);
  }

  release(profilePath: string, ownerId: string): void {
    const normalized = path.resolve(profilePath);
    const existing = this.locks.get(normalized);
    if (!existing) {
      return;
    }
    if (existing.owner !== ownerId) {
      throw new Error('Cannot release profile lock owned by another worker');
    }
    if (fs.existsSync(existing.lockPath)) {
      fs.unlinkSync(existing.lockPath);
    }
    this.locks.delete(normalized);
  }

  isLocked(profilePath: string): boolean {
    return this.locks.has(path.resolve(profilePath));
  }

  forceClearStaleLock(profilePath: string): void {
    const normalized = path.resolve(profilePath);
    const lockPath = path.join(normalized, '.noveltrans.lock');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    this.locks.delete(normalized);
  }

  /** Clear orphan `.noveltrans.lock` files under browser-profiles root (startup). */
  clearOrphanLocksUnder(profilesRoot: string): number {
    if (!fs.existsSync(profilesRoot)) {
      return 0;
    }
    let cleared = 0;
    for (const entry of fs.readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const profilePath = path.join(profilesRoot, entry.name);
      const lockPath = path.join(profilePath, '.noveltrans.lock');
      if (!fs.existsSync(lockPath)) continue;
      if (this.locks.has(path.resolve(profilePath))) continue;
      fs.unlinkSync(lockPath);
      cleared += 1;
    }
    return cleared;
  }
}

export const profileLockManager = new ProfileLockManager();
