import type { DatabaseManager } from '../db/database-manager';
import { classifyCrashLifecycle } from '../gemini/gemini-request-recovery';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { logger } from '../logging/logger';
import type { GeminiRequestLifecycle } from '@shared/constants/gemini';

export interface StartupGeminiRecoveryReport {
  crashedAttempts: number;
  geminiUnknownAfterCrash: number;
  geminiAbandonedBeforeSend: number;
  profileLeasesCleared: number;
  expiredJobLeases: number;
}

/**
 * Startup recovery beyond expired scheduler leases:
 * - job_attempts stuck RUNNING → CRASHED
 * - in-flight gemini_requests → UNKNOWN_AFTER_CRASH (post-send) or FAILED (pre-send)
 * - stale profile leases under profiles root
 */
export function recoverJobsGeminiAndProfilesOnStartup(
  db: DatabaseManager,
  options?: { profilesRoot?: string | null },
): StartupGeminiRecoveryReport {
  const crashedAttempts = db.jobs.markAllRunningAttemptsCrashed();

  let geminiUnknownAfterCrash = 0;
  let geminiAbandonedBeforeSend = 0;

  for (const row of db.geminiRequests.listNonTerminal()) {
    const lifecycle = row.lifecycle as GeminiRequestLifecycle;
    const kind = classifyCrashLifecycle(lifecycle);
    if (kind === 'terminal') continue;
    if (kind === 'unknown_after_sent') {
      db.geminiRequests.markUnknownAfterCrash(row.id);
      geminiUnknownAfterCrash += 1;
    } else {
      db.geminiRequests.markAbandonedBeforeSend(row.id);
      geminiAbandonedBeforeSend += 1;
    }
  }

  let profileLeasesCleared = 0;
  if (options?.profilesRoot) {
    try {
      profileLeasesCleared = profileLockManager.recoverStaleUnder(options.profilesRoot);
    } catch (error) {
      logger.warn('Profile lease recovery failed on startup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const expiredJobLeases = db.jobs.recoverExpiredLeases();

  const report: StartupGeminiRecoveryReport = {
    crashedAttempts,
    geminiUnknownAfterCrash,
    geminiAbandonedBeforeSend,
    profileLeasesCleared,
    expiredJobLeases,
  };

  if (
    crashedAttempts > 0 ||
    geminiUnknownAfterCrash > 0 ||
    geminiAbandonedBeforeSend > 0 ||
    profileLeasesCleared > 0 ||
    expiredJobLeases > 0
  ) {
    logger.info('Startup recovery (jobs / gemini_requests / profiles)', report);
  }

  return report;
}
