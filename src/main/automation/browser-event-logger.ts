import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';
import type { AutomationEventRepository } from '../db/repositories/gemini-request-repository';
import { logger } from '../logging/logger';

export interface BrowserEventInput {
  eventType: string;
  correlationId?: string;
  jobId?: string | null;
  workerId?: string | null;
  payload?: Record<string, unknown>;
  screenshotPath?: string | null;
}

/**
 * Structured browser automation event log (DB + optional JSONL file).
 */
export class BrowserEventLogger {
  constructor(
    private readonly events: AutomationEventRepository | null,
    private readonly logDir: string,
  ) {
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  log(page: Page | null, input: BrowserEventInput): string {
    const id = newId();
    const timestamp = utcNow();
    const entry = {
      id,
      timestamp,
      ...input,
      url: page?.url() ?? null,
    };

    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(path.join(this.logDir, 'browser-events.jsonl'), line, 'utf8');

    if (this.events) {
      try {
        this.events.insert({
          id,
          job_id: input.jobId ?? null,
          // Only persist when caller passed a real worker_states.id; never block automation on log FK.
          worker_id: input.workerId ?? null,
          event_type: input.eventType,
          payload: JSON.stringify({
            correlationId: input.correlationId,
            ...input.payload,
          }),
          screenshot_path: input.screenshotPath ?? null,
          created_at: timestamp,
        });
      } catch (error) {
        logger.warn('Automation event DB insert skipped', {
          eventType: input.eventType,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Browser event', {
      eventType: input.eventType,
      correlationId: input.correlationId,
    });

    return id;
  }
}
