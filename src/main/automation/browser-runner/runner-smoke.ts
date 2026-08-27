import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AutomationManager } from '../automation-manager';
import { resolveDefaultRunnerScriptPath } from './runner-host';
import { newId } from '../../db/utils/uuid';
import { logger } from '../../logging/logger';

export interface RunnerSmokeResult {
  ok: boolean;
  steps: string[];
  error?: string;
  runnerScriptPath: string;
}

/**
 * Packaged / CI smoke: spawn utilityProcess runner, OPEN → GET_STATUS → SCREENSHOT → CLOSE.
 * Headless OPEN so it runs without UI interaction.
 */
export async function runBrowserRunnerSmoke(
  options?: { cacheDir?: string; profileDir?: string },
): Promise<RunnerSmokeResult> {
  const steps: string[] = [];
  const runnerScriptPath = resolveDefaultRunnerScriptPath();
  steps.push(`resolve:${runnerScriptPath}`);

  if (!fs.existsSync(runnerScriptPath)) {
    return {
      ok: false,
      steps,
      error: `runner-entry missing at ${runnerScriptPath}`,
      runnerScriptPath,
    };
  }
  steps.push('runner_script_exists');

  const root =
    options?.cacheDir ??
    path.join(os.tmpdir(), `nts-smoke-runner-${Date.now()}`);
  const profilePath =
    options?.profileDir ?? path.join(root, 'profile');
  fs.mkdirSync(profilePath, { recursive: true });
  fs.mkdirSync(path.join(root, 'cache'), { recursive: true });

  const manager = new AutomationManager({
    cacheDir: path.join(root, 'cache'),
    transport: 'utility-process',
    runnerScriptPath,
  });

  const workerId = `smoke-${Date.now()}`;
  try {
    steps.push('open');
    const open = await manager.openWorker({
      workerId,
      profilePath,
      headless: true,
    });
    if (!open.ok) {
      throw new Error(open.errorMessage ?? open.errorCode ?? 'OPEN failed');
    }
    steps.push('open_ok');

    steps.push('get_status');
    const status = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'GET_STATUS',
    });
    if (!status.ok) {
      throw new Error(status.errorMessage ?? 'GET_STATUS failed');
    }
    steps.push(`get_status_ok:${status.state}`);

    steps.push('screenshot');
    const shot = await manager.sendCommand(workerId, {
      id: newId(),
      type: 'SCREENSHOT',
      tag: 'smoke',
    });
    if (!shot.ok) {
      throw new Error(shot.errorMessage ?? 'SCREENSHOT failed');
    }
    steps.push('screenshot_ok');

    steps.push('close');
    await manager.closeWorker(workerId);
    steps.push('close_ok');

    logger.info('Browser runner smoke PASS', { steps, runnerScriptPath });
    return { ok: true, steps, runnerScriptPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Browser runner smoke FAIL', { message, steps, runnerScriptPath });
    try {
      await manager.closeWorker(workerId);
    } catch {
      // ignore
    }
    try {
      await manager.disposeAll();
    } catch {
      // ignore
    }
    return { ok: false, steps, error: message, runnerScriptPath };
  }
}
