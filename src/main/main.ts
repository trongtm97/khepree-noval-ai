/**
 * Minimal main entry — avoids loading better-sqlite3 / full app for smoke path.
 * Heavy bootstrap is dynamic so --nts-smoke-runner stays lean.
 */
import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { WINDOWS_SQUIRREL_APP_USER_MODEL_ID } from '@shared/constants/app';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SMOKE_RUNNER_FLAG = '--nts-smoke-runner';
const smokeRequested = process.argv.some(
  (arg) => arg === SMOKE_RUNNER_FLAG || arg.endsWith(SMOKE_RUNNER_FLAG),
);

try {
  const probePath =
    process.env.NTS_SMOKE_REPORT_PATH ??
    path.join(os.tmpdir(), 'nts-smoke-runner-boot.json');
  fs.writeFileSync(
    probePath,
    JSON.stringify({
      phase: 'main_loaded',
      smokeRequested,
      argv: process.argv,
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
      reportPath: probePath,
    }),
    'utf8',
  );
} catch {
  // ignore
}

if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_SQUIRREL_APP_USER_MODEL_ID);
}

if (started && !smokeRequested) {
  app.quit();
}

if (smokeRequested) {
  void app.whenReady().then(async () => {
    const reportPath =
      process.env.NTS_SMOKE_REPORT_PATH ??
      path.join(os.tmpdir(), 'nts-smoke-runner-report.json');
    const writeReport = (payload: Record<string, unknown>) => {
      try {
        fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8');
      } catch {
        // best-effort
      }
      try {
        process.stdout.write(
          `${payload.ok ? 'SMOKE_RUNNER_PASS' : 'SMOKE_RUNNER_FAIL'} ${JSON.stringify(payload)}\n`,
        );
      } catch {
        // GUI subsystem may ignore stdout
      }
    };

    try {
      const { runBrowserRunnerSmoke } = await import(
        './automation/browser-runner/runner-smoke'
      );
      const result = await runBrowserRunnerSmoke();
      writeReport({
        ok: result.ok,
        steps: result.steps,
        error: result.error,
        runner: result.runnerScriptPath,
        reportPath,
      });
      app.exit(result.ok ? 0 : 1);
    } catch (error) {
      writeReport({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        reportPath,
      });
      app.exit(1);
    }
  });
} else {
  void import('./app-bootstrap').then((m) => { m.startApplication(); });
}
