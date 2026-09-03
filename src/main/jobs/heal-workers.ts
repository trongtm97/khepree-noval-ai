import type { DatabaseManager } from '../db/database-manager';

const TERMINAL_JOB_STATES = new Set([
  'COMPLETED',
  'ACCEPTED_WITH_WARNINGS',
  'FAILED',
  'NEEDS_ATTENTION',
  'CANCELLED',
  'SKIPPED',
]);

function isDbClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not open|closed/i.test(message);
}

/**
 * Clear stale BUSY / NEEDS_ATTENTION when no live job owns the worker.
 * Keeps scheduler claimable after Notebook/Accounts browser or crashed jobs.
 */
export function healIdleWorkers(db: DatabaseManager): number {
  let healed = 0;
  try {
    for (const w of db.workerStates.listAll()) {
      const account = db.googleAccounts.getById(w.google_account_id);
      const accountOk =
        !!account && (account.status === 'READY' || account.status === 'BUSY');

      if (w.health === 'BUSY') {
        if (!w.current_job_id) {
          db.workerStates.markReady(w.id);
          healed += 1;
          continue;
        }
        const job = db.jobs.getById(w.current_job_id);
        if (!job || TERMINAL_JOB_STATES.has(job.state)) {
          db.workerStates.markReady(w.id);
          healed += 1;
        }
        continue;
      }

      if (w.health === 'NEEDS_ATTENTION' && accountOk) {
        if (!w.current_job_id) {
          db.workerStates.markReady(w.id);
          healed += 1;
          continue;
        }
        const job = db.jobs.getById(w.current_job_id);
        if (!job || TERMINAL_JOB_STATES.has(job.state)) {
          db.workerStates.markReady(w.id);
          healed += 1;
        }
      }
    }
    try {
      const { getAttentionInboxService } =
        require('../services/attention-inbox-service') as typeof import('../services/attention-inbox-service');
      getAttentionInboxService(db).reconcile();
    } catch {
      // optional
    }
  } catch (error) {
    // Deferred scheduler kick after tests close SQLite — do not crash the process.
    if (isDbClosedError(error)) return healed;
    throw error;
  }
  return healed;
}
