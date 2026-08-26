import { app, dialog } from 'electron';
import { logger } from '../logging/logger';

let handlersInstalled = false;

/**
 * Global main-process crash / rejection handlers.
 * Logs, shows dialog once for fatal errors, does not silently swallow.
 */
export function installMainCrashHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('uncaughtException', (error) => {
    try {
      logger.error('Uncaught exception in main process', {
        message: error.message,
        stack: error.stack,
      });
    } catch {
      console.error('Uncaught exception', error);
    }
    try {
      if (app.isReady()) {
        void dialog.showMessageBox({
          type: 'error',
          title: 'NovelTrans Studio',
          message: 'Unexpected error',
          detail: error.message,
        });
      }
    } catch {
      // ignore dialog failures during crash
    }
  });

  process.on('unhandledRejection', (reason) => {
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : String(reason);
    try {
      logger.error('Unhandled promise rejection in main process', {
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    } catch {
      console.error('Unhandled rejection', reason);
    }
  });

  app.on('render-process-gone', (_event, _webContents, details) => {
    logger.error('Renderer process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  app.on('child-process-gone', (_event, details) => {
    logger.error('Child process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      name: details.name,
      serviceName: details.serviceName,
    });
  });
}
