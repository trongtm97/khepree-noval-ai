import type { AutomationManager } from '../automation/automation-manager';
import { logger } from '../logging/logger';

/**
 * Best-effort recovery when a browser worker / child process dies.
 * Callers pass the live AutomationManager when available.
 */
export async function recoverBrowserWorkers(
  manager: AutomationManager | null | undefined,
  reason: string,
): Promise<{ recovered: number }> {
  if (!manager) {
    logger.warn('Browser recovery skipped — no AutomationManager', { reason });
    return { recovered: 0 };
  }

  try {
    const before = manager.listWorkers();
    // Close and drop crashed workers; scheduler / services reopen on demand.
    for (const worker of before) {
      try {
        await manager.closeWorker(worker.workerId);
      } catch (error) {
        logger.warn('Failed to close crashed worker during recovery', {
          workerId: worker.workerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    logger.info('Browser worker recovery complete', {
      reason,
      recovered: before.length,
    });
    return { recovered: before.length };
  } catch (error) {
    logger.error('Browser recovery failed', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return { recovered: 0 };
  }
}
