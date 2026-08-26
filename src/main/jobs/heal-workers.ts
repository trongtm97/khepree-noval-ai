import type { DatabaseManager } from '../db/database-manager';

const TERMINAL_JOB_STATES = new Set([
  'COMPLETED',
  'ACCEPTED_WITH_WARNINGS',
  'FAILED',
  'NEEDS_ATTENTION',
  'CANCELLED',
  'SKIPPED',
]);

/**
 * Clear stale BUSY / NEEDS_ATTENTION when no live job owns the worker.
 * Keeps scheduler claimable after Notebook/Accounts browser or crashed jobs.
 */
export function healIdleWorkers(db: DatabaseManager): number {
  let healed = 0;
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
  return healed;
}
