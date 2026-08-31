import { getJobService } from '../services/job-service-singleton';
import { logger } from '../logging/logger';

/** Pause queued translation work when Khepree revokes runtime access — in-flight batches finish at safe boundary. */
export function lockProtectedJobsOnKhepreeRevocation(reason: string): { paused: number } {
  try {
    const { affected } = getJobService().pauseAllForLicensing(reason);
    logger.info('Khepree licensing lock applied', { reason, paused: affected });
    return { paused: affected };
  } catch (error) {
    logger.warn('Khepree licensing lock failed', {
      reason,
      message: error instanceof Error ? error.message : String(error),
    });
    return { paused: 0 };
  }
}
