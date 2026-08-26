import { AutomationScheduler } from '../jobs/scheduler';
import type { JobInitialSender } from '../jobs/batch-executor';
import type { RepairSender } from '../jobs/repair-loop';
import { getDatabase } from '../db/connection';
import { getJobService } from './job-service-singleton';
import {
  DEFAULT_MAX_CONCURRENT_WORKERS,
  DEFAULT_SCHEDULER_TICK_MS,
} from '@shared/constants/job';
import { logger } from '../logging/logger';

let scheduler: AutomationScheduler | null = null;

/**
 * Start durable scheduler. Call after DB init.
 * Production should inject Gemini senders; tests inject mocks.
 */
export function initializeAutomationScheduler(options?: {
  sendInitial?: JobInitialSender;
  sendRepair?: RepairSender;
  maxConcurrentWorkers?: number;
  tickMs?: number;
  autoStart?: boolean;
}): AutomationScheduler {
  const db = getDatabase();
  const sendInitial: JobInitialSender =
    options?.sendInitial ??
    (() =>
      Promise.reject(
        new Error(
          'Scheduler sendInitial not configured — enqueue jobs after wiring Gemini',
        ),
      ));

  scheduler = new AutomationScheduler(db, {
    sendInitial,
    sendRepair: options?.sendRepair,
    maxConcurrentWorkers: options?.maxConcurrentWorkers ?? DEFAULT_MAX_CONCURRENT_WORKERS,
    tickMs: options?.tickMs ?? DEFAULT_SCHEDULER_TICK_MS,
  });

  getJobService().attachScheduler(scheduler);

  if (options?.autoStart !== false) {
    scheduler.start();
    logger.info('Automation scheduler started', {
      maxConcurrent: options?.maxConcurrentWorkers ?? DEFAULT_MAX_CONCURRENT_WORKERS,
    });
  }

  return scheduler;
}

export function getAutomationScheduler(): AutomationScheduler | null {
  return scheduler;
}

export async function shutdownAutomationScheduler(): Promise<void> {
  if (scheduler) {
    await scheduler.stop({ waitMs: 15_000 });
    scheduler = null;
  }
}

export function resetAutomationSchedulerForTests(): void {
  scheduler = null;
}
