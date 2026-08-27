import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './app/create-window';
import { installMainCrashHandlers } from './app/crash-handlers';
import { registerIpcHandlers } from './ipc/register-handlers';
import { logger } from './logging/logger';
import { pathsService } from './services/paths-service';
import { initializeDatabase, closeDatabase } from './db/connection';
import { initializeSecurityServices } from './security';
import { initializeAccountWorkerService } from './services/account-worker-singleton';
import { initializeImportService } from './import/import-service-singleton';
import {
  initializeSourceFolderService,
  shutdownSourceFolderSubsystem,
  startupSourceFolderSubsystem,
} from './source-folder/source-folder-singleton';
import { setSourceFolderMainWindow } from './source-folder/source-folder-event-bridge';
import { initializeTermService } from './services/term-service-singleton';
import { initializeMemoryService } from './services/memory-service-singleton';
import { initializeTranslationPackService } from './services/translation-pack-service-singleton';
import { initializeDriveSyncService } from './services/drive-sync-service-singleton';
import { initializeNotebookService } from './services/notebook-service-singleton';
import { initializeGeminiService } from './services/gemini-service-singleton';
import { initializeJobService } from './services/job-service-singleton';
import {
  initializeAiProviderService,
  shutdownAiProviderService,
} from './ai/ai-provider-singleton';
import {
  initializeAutomationScheduler,
  shutdownAutomationScheduler,
} from './services/scheduler-singleton';
import { startAutoBackupScheduler, stopAutoBackupScheduler } from './portability/auto-backup';
import { recoverBrowserWorkers } from './automation/browser-recovery';
import {
  initializeBrowserRuntimeManager,
  shutdownBrowserRuntimeManager,
} from './automation/browser-runner/browser-runtime-manager';
import { profileLockManager } from './automation/browser-runner/profile-lock';
import { recoverJobsGeminiAndProfilesOnStartup } from './gemini/startup-recovery';

/** Full application bootstrap (non-smoke path). */
export function startApplication(): void {
  installMainCrashHandlers();

  void app.whenReady().then(() => {
    const paths = pathsService.initialize();
    logger.initialize(paths.logs);

    const db = initializeDatabase({
      dataDir: paths.data,
      backupsDir: paths.backups,
    });
    logger.info('Database initialized', {
      dbPath: db.dbPath,
      schemaVersion: db.getSchemaVersion(),
    });

    // job_attempts + gemini_requests + profile leases (before scheduler claims work)
    try {
      recoverJobsGeminiAndProfilesOnStartup(db, {
        profilesRoot: paths.browserProfiles,
      });
    } catch (error) {
      logger.warn('Startup gemini/job recovery failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const { secretStorage } = initializeSecurityServices();
    initializeAccountWorkerService();
    initializeImportService();
    initializeSourceFolderService();
    initializeTermService();
    initializeMemoryService();
    initializeTranslationPackService();
    initializeDriveSyncService();
    initializeNotebookService();
    initializeGeminiService();
    initializeBrowserRuntimeManager();
    initializeJobService();
    const aiProviders = initializeAiProviderService();
    initializeAutomationScheduler({
      autoStart: true,
      sendInitial: (ctx) => aiProviders.manager.sendForJob(ctx),
      sendRepair: (req) => aiProviders.manager.sendRepair(req),
    });
    void aiProviders.initialize().catch((error) => {
      logger.warn('AI provider initialize deferred failure', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    startAutoBackupScheduler({
      db,
      dbPath: db.dbPath,
      backupsDir: paths.backups,
    });
    void secretStorage.healthCheck().then((health) => {
      logger.info('Secret storage health', {
        available: health.available,
        mode: health.mode,
        backend: health.backend,
      });
    });

    registerIpcHandlers();
    // Profile leases already recovered in recoverJobsGeminiAndProfilesOnStartup;
    // keep a second pass for leases created after DB init.
    try {
      const cleared = profileLockManager.recoverStaleUnder(paths.browserProfiles);
      if (cleared > 0) {
        logger.info('Recovered stale browser profile leases on startup', { cleared });
      }
    } catch (error) {
      logger.warn('Failed to clear orphan browser profile locks', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const mainWindow = createMainWindow();
    setSourceFolderMainWindow(mainWindow);
    startupSourceFolderSubsystem();
    logger.info('Application started', {
      version: app.getVersion(),
      userData: paths.root,
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });

    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'Utility' || details.type === 'GPU') {
        return;
      }
      void recoverBrowserWorkers(
        null,
        `child-process-gone:${details.type}:${details.reason}`,
      );
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  let isQuitting = false;

  app.on('before-quit', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    isQuitting = true;
    logger.info('Application shutting down');
    stopAutoBackupScheduler();
    void (async () => {
      try {
        shutdownSourceFolderSubsystem();
        await shutdownAutomationScheduler();
        await shutdownBrowserRuntimeManager();
        await shutdownAiProviderService();
      } catch (error) {
        logger.error('Scheduler shutdown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        closeDatabase();
        app.quit();
      }
    })();
  });
}
