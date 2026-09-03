import type { DatabaseManager } from '../db/database-manager';
import { classifyCrashLifecycle } from '../gemini/gemini-request-recovery';
import { profileLockManager } from '../automation/browser-runner/profile-lock';
import { getBrowserCircuitBreaker } from '../automation/browser-pool/circuit-breaker';
import { purgeFailureDiagnosticsOlderThan } from '../automation/diagnostics-retention';
import { healIdleWorkers } from '../jobs/heal-workers';
import { logger } from '../logging/logger';

export interface StartupBrowserRecoveryReport {
  crashedAttempts: number;
  geminiUnknownAfterCrash: number;
  geminiAbandonedBeforeSend: number;
  aiRequestUnknownAfterCrash: number;
  aiRequestAbandonedBeforeSend: number;
  profileLeasesCleared: number;
  expiredJobLeases: number;
  diagnosticsPurged: number;
  workersHealed: number;
}

/**
 * Startup recovery for ALL browser providers (not Gemini-only):
 * - job_attempts stuck RUNNING → CRASHED
 * - gemini_requests + ai_requests in-flight classification
 * - stale profile leases under profiles root
 * - expired job leases
 * - heal idle workers
 * - purge old failure diagnostics (retention)
 */
export function recoverJobsGeminiAndProfilesOnStartup(
  db: DatabaseManager,
  options?: { profilesRoot?: string | null },
): StartupBrowserRecoveryReport {
  const crashedAttempts = db.jobs.markAllRunningAttemptsCrashed();

  let geminiUnknownAfterCrash = 0;
  let geminiAbandonedBeforeSend = 0;

  for (const row of db.geminiRequests.listNonTerminal()) {
    const kind = classifyCrashLifecycle(row.lifecycle);
    if (kind === 'terminal') continue;
    if (kind === 'unknown_after_sent') {
      db.geminiRequests.markUnknownAfterCrash(row.id);
      geminiUnknownAfterCrash += 1;
    } else {
      db.geminiRequests.markAbandonedBeforeSend(row.id);
      geminiAbandonedBeforeSend += 1;
    }
  }

  let aiRequestUnknownAfterCrash = 0;
  let aiRequestAbandonedBeforeSend = 0;
  for (const row of db.aiRequests.listNonTerminal()) {
    const lifecycle = (row.lifecycle ?? '').toLowerCase();
    const sent =
      lifecycle.includes('sent') ||
      lifecycle.includes('waiting') ||
      lifecycle.includes('streaming') ||
      row.status === 'WAITING_AI' ||
      row.status === 'GENERATING';
    if (sent) {
      db.aiRequests.markUnknownAfterCrash(row.id);
      aiRequestUnknownAfterCrash += 1;
    } else {
      db.aiRequests.markAbandonedBeforeSend(row.id);
      aiRequestAbandonedBeforeSend += 1;
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
  const workersHealed = healIdleWorkers(db);

  let diagnosticsPurged = 0;
  try {
    diagnosticsPurged = purgeFailureDiagnosticsOlderThan().deleted;
  } catch (error) {
    logger.warn('Diagnostics retention purge failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // In-memory circuit breakers restart empty — intentional after process crash.
  getBrowserCircuitBreaker().clearAll();

  const report: StartupBrowserRecoveryReport = {
    crashedAttempts,
    geminiUnknownAfterCrash,
    geminiAbandonedBeforeSend,
    aiRequestUnknownAfterCrash,
    aiRequestAbandonedBeforeSend,
    profileLeasesCleared,
    expiredJobLeases,
    diagnosticsPurged,
    workersHealed,
  };

  if (
    crashedAttempts > 0 ||
    geminiUnknownAfterCrash > 0 ||
    geminiAbandonedBeforeSend > 0 ||
    aiRequestUnknownAfterCrash > 0 ||
    aiRequestAbandonedBeforeSend > 0 ||
    profileLeasesCleared > 0 ||
    expiredJobLeases > 0 ||
    diagnosticsPurged > 0 ||
    workersHealed > 0
  ) {
    logger.info('Startup recovery (jobs / browser providers / profiles)', {
      ...report,
    });
  }

  return report;
}

/** @deprecated Alias — same as recoverJobsGeminiAndProfilesOnStartup. */
export const recoverAllBrowserProvidersOnStartup = recoverJobsGeminiAndProfilesOnStartup;
