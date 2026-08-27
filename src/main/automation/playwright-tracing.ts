import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import { logger } from '../logging/logger';

/**
 * Conditional Playwright tracing for failed/retry jobs only.
 * Never enable heavy traces for every default batch.
 */
export interface FailTraceSession {
  enabled: boolean;
  diagnosticsDir: string;
  tag: string;
}

export async function startFailTrace(
  context: BrowserContext,
  diagnosticsDir: string,
  tag = 'fail',
): Promise<FailTraceSession> {
  const session: FailTraceSession = {
    enabled: false,
    diagnosticsDir,
    tag,
  };
  try {
    if (typeof context.tracing.start !== 'function') {
      return session;
    }
    fs.mkdirSync(diagnosticsDir, { recursive: true });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    session.enabled = true;
    logger.info('Playwright fail-trace started', { diagnosticsDir, tag });
  } catch (error) {
    logger.warn('Playwright fail-trace start skipped', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return session;
}

export async function stopFailTrace(
  context: BrowserContext | null,
  session: FailTraceSession | null,
  save: boolean,
): Promise<string | null> {
  if (!session?.enabled || !context) return null;
  try {
    if (typeof context.tracing.stop !== 'function') return null;
    if (!save) {
      await context.tracing.stop().catch(() => undefined);
      return null;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTag = session.tag.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
    const tracePath = path.join(session.diagnosticsDir, `trace-${safeTag}-${stamp}.zip`);
    await context.tracing.stop({ path: tracePath });
    logger.info('Playwright fail-trace saved', { tracePath });
    return tracePath;
  } catch (error) {
    logger.warn('Playwright fail-trace stop failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** True when this job attempt should record a Playwright trace. */
export function shouldEnableFailTrace(options: {
  /** Explicit probe / diagnostics UI. */
  force?: boolean;
  /** Scheduler / recovery retry attempt (1 = first try). */
  attempt?: number;
  /** gemini_requests resend after prior failure. */
  isRetry?: boolean;
}): boolean {
  if (options.force) return true;
  if (options.isRetry) return true;
  if (typeof options.attempt === 'number' && options.attempt >= 2) return true;
  return false;
}
