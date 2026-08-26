import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'node:fs/promises';
import {
  DEFAULT_STABILITY_MAX_WAIT_MS,
  DEFAULT_STABILITY_POLL_MS,
  DEFAULT_WATCH_DEBOUNCE_MS,
} from '@shared/constants/source-folder';
import { getDatabase } from '../db/connection';
import { logger } from '../logging/logger';
import type { SourceFolderService } from './source-folder-service';

interface WatcherEntry {
  watcher: FSWatcher;
  projectId: string;
  pending: Map<string, ReturnType<typeof setTimeout>>;
}

export class SourceWatcherManager {
  private readonly entries = new Map<string, WatcherEntry>();

  constructor(private readonly service: SourceFolderService) {}

  startWatcher(projectId: string): void {
    if (this.entries.has(projectId)) {
      return;
    }

    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (
      project?.source_mode !== 'FOLDER' ||
      !project.source_folder_path ||
      project.watch_folder_enabled !== 1
    ) {
      return;
    }

    const folderPath = project.source_folder_path;
    const watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: DEFAULT_WATCH_DEBOUNCE_MS,
        pollInterval: DEFAULT_STABILITY_POLL_MS,
      },
    });

    const entry: WatcherEntry = {
      watcher,
      projectId,
      pending: new Map(),
    };
    this.entries.set(projectId, entry);

    const schedule = (event: 'add' | 'change' | 'unlink', filePath: string) => {
      if (!filePath.toLowerCase().endsWith('.txt')) return;
      const existing = entry.pending.get(filePath);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        entry.pending.delete(filePath);
        void this.handleStableEvent(projectId, event, filePath);
      }, DEFAULT_WATCH_DEBOUNCE_MS);
      entry.pending.set(filePath, timer);
    };

    watcher.on('add', (filePath) => { schedule('add', filePath); });
    watcher.on('change', (filePath) => { schedule('change', filePath); });
    watcher.on('unlink', (filePath) => { schedule('unlink', filePath); });
    watcher.on('error', (err) => {
      logger.warn('source-folder watcher error', {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info('source-folder watcher started', { projectId, folderPath });
  }

  stopWatcher(projectId: string): void {
    const entry = this.entries.get(projectId);
    if (!entry) return;
    for (const timer of entry.pending.values()) {
      clearTimeout(timer);
    }
    void entry.watcher.close();
    this.entries.delete(projectId);
  }

  restartWatcher(projectId: string): void {
    this.stopWatcher(projectId);
    this.startWatcher(projectId);
  }

  stopAll(): void {
    for (const projectId of [...this.entries.keys()]) {
      this.stopWatcher(projectId);
    }
  }

  startAllEnabled(): void {
    const db = getDatabase();
    for (const project of db.projects.listFolderProjects()) {
      if (project.watch_folder_enabled === 1 && project.source_folder_path) {
        this.startWatcher(project.id);
      }
    }
  }

  private async handleStableEvent(
    projectId: string,
    event: 'add' | 'change' | 'unlink',
    filePath: string,
  ): Promise<void> {
    try {
      if (event === 'unlink') {
        this.service.handleFileMissing(projectId, filePath);
        return;
      }

      await this.waitForStableFile(filePath);
      await this.service.scanSingleFile(projectId, filePath);
    } catch (err: unknown) {
      logger.warn('source-folder watcher handler failed', {
        projectId,
        event,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async waitForStableFile(filePath: string): Promise<void> {
    let lastSize = -1;
    let lastMtime = -1;
    let stableCount = 0;
    const started = Date.now();

    while (Date.now() - started < DEFAULT_STABILITY_MAX_WAIT_MS) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size === lastSize && stat.mtimeMs === lastMtime) {
          stableCount += 1;
          if (stableCount >= 2) return;
        } else {
          stableCount = 0;
          lastSize = stat.size;
          lastMtime = stat.mtimeMs;
        }
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, DEFAULT_STABILITY_POLL_MS));
    }
  }
}
