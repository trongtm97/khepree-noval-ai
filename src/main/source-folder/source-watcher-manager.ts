import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WATCH_BATCH_COALESCE_MS,
  DEFAULT_WATCH_DEBOUNCE_MS,
  DEFAULT_STABILITY_POLL_MS,
} from '@shared/constants/source-folder';
import { getDatabase } from '../db/connection';
import { logger } from '../logging/logger';
import type { SourceFolderService } from './source-folder-service';
import type { WatchRawEvent } from './watch-event-classifier';
import { assertPathContainedInRoot } from './watch-folder-policy';
import type { WatchRootRow } from '../db/repositories/watch-root-repository';

type WatchTargetKind = 'project' | 'root';

interface WatcherEntry {
  watcher: FSWatcher;
  kind: WatchTargetKind;
  key: string;
  rootPath: string;
  projectId?: string;
  watchRoot?: WatchRootRow;
  pathTimers: Map<string, ReturnType<typeof setTimeout>>;
  batchEvents: WatchRawEvent[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

export class SourceWatcherManager {
  private readonly entries = new Map<string, WatcherEntry>();

  constructor(private readonly service: SourceFolderService) {}

  startWatcher(projectId: string): void {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (
      project?.source_mode !== 'FOLDER' ||
      !project.source_folder_path ||
      project.watch_folder_enabled !== 1
    ) {
      return;
    }

    const key = this.projectKey(projectId);
    if (this.entries.has(key)) return;

    this.attachWatcher({
      key,
      kind: 'project',
      rootPath: path.resolve(project.source_folder_path),
      projectId,
      depth: 0,
    });
  }

  startWatchRoot(watchRootId: string): void {
    const db = getDatabase();
    const root = db.watchRoots.getRootById(watchRootId);
    if (!root || root.enabled !== 1) return;

    const key = this.rootKey(watchRootId);
    if (this.entries.has(key)) return;

    const bindings = db.watchRoots.listBindingsForRoot(watchRootId);
    if (bindings.length === 0) {
      logger.warn('watch root has no project bindings', { watchRootId });
      return;
    }

    this.attachWatcher({
      key,
      kind: 'root',
      rootPath: path.resolve(root.root_path),
      watchRoot: root,
      depth: undefined,
    });
  }

  stopWatcher(projectId: string): void {
    this.stopEntry(this.projectKey(projectId));
  }

  stopWatchRoot(watchRootId: string): void {
    this.stopEntry(this.rootKey(watchRootId));
  }

  restartWatcher(projectId: string): void {
    this.stopWatcher(projectId);
    this.startWatcher(projectId);
  }

  restartWatchRoot(watchRootId: string): void {
    this.stopWatchRoot(watchRootId);
    this.startWatchRoot(watchRootId);
  }

  stopAll(): void {
    for (const key of [...this.entries.keys()]) {
      this.stopEntry(key);
    }
  }

  startAllEnabled(): void {
    const db = getDatabase();
    for (const project of db.projects.listFolderProjects()) {
      if (project.watch_folder_enabled === 1 && project.source_folder_path) {
        this.startWatcher(project.id);
      }
    }
    for (const root of db.watchRoots.listEnabledRoots()) {
      this.startWatchRoot(root.id);
    }
  }

  private projectKey(projectId: string): string {
    return `project:${projectId}`;
  }

  private rootKey(watchRootId: string): string {
    return `root:${watchRootId}`;
  }

  private attachWatcher(input: {
    key: string;
    kind: WatchTargetKind;
    rootPath: string;
    projectId?: string;
    watchRoot?: WatchRootRow;
    depth?: number;
  }): void {
    const watcher = chokidar.watch(input.rootPath, {
      persistent: true,
      ignoreInitial: true,
      depth: input.depth,
      followSymlinks: false,
      awaitWriteFinish: {
        stabilityThreshold: DEFAULT_WATCH_DEBOUNCE_MS,
        pollInterval: DEFAULT_STABILITY_POLL_MS,
      },
    });

    const entry: WatcherEntry = {
      watcher,
      kind: input.kind,
      key: input.key,
      rootPath: input.rootPath,
      projectId: input.projectId,
      watchRoot: input.watchRoot,
      pathTimers: new Map(),
      batchEvents: [],
      batchTimer: null,
    };
    this.entries.set(input.key, entry);

    const schedule = (event: WatchRawEvent['kind'], filePath: string) => {
      if (!filePath.toLowerCase().endsWith('.txt')) return;
      if (!this.isSafeWatchPath(entry, filePath)) return;

      const projectId = this.resolveProjectId(entry, filePath);
      if (!projectId) return;

      const existing = entry.pathTimers.get(filePath);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        entry.pathTimers.delete(filePath);
        entry.batchEvents.push({ kind: event, filePath, projectId });
        this.scheduleBatchFlush(entry);
      }, DEFAULT_WATCH_DEBOUNCE_MS);
      entry.pathTimers.set(filePath, timer);
    };

    watcher.on('add', (filePath) => {
      schedule('add', filePath);
    });
    watcher.on('change', (filePath) => {
      schedule('change', filePath);
    });
    watcher.on('unlink', (filePath) => {
      schedule('unlink', filePath);
    });
    watcher.on('error', (err) => {
      logger.warn('source-folder watcher error', {
        key: input.key,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info('source-folder watcher started', {
      key: input.key,
      rootPath: input.rootPath,
      kind: input.kind,
    });
  }

  private stopEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    for (const timer of entry.pathTimers.values()) {
      clearTimeout(timer);
    }
    if (entry.batchTimer) clearTimeout(entry.batchTimer);
    void entry.watcher.close();
    this.entries.delete(key);
  }

  private scheduleBatchFlush(entry: WatcherEntry): void {
    if (entry.batchTimer) return;
    entry.batchTimer = setTimeout(() => {
      entry.batchTimer = null;
      void this.flushBatch(entry);
    }, DEFAULT_WATCH_BATCH_COALESCE_MS);
  }

  private async flushBatch(entry: WatcherEntry): Promise<void> {
    if (entry.batchEvents.length === 0) return;
    const events = [...entry.batchEvents];
    entry.batchEvents = [];

    const byProject = new Map<string, WatchRawEvent[]>();
    for (const event of events) {
      const list = byProject.get(event.projectId) ?? [];
      list.push(event);
      byProject.set(event.projectId, list);
    }

    for (const [projectId, projectEvents] of byProject) {
      try {
        await this.service.processWatchEvents(projectId, projectEvents, {
          watchRoot: entry.watchRoot,
        });
      } catch (err: unknown) {
        logger.warn('source-folder watch batch failed', {
          projectId,
          key: entry.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private resolveProjectId(entry: WatcherEntry, filePath: string): string | null {
    if (entry.kind === 'project' && entry.projectId) {
      return entry.projectId;
    }
    if (entry.kind === 'root' && entry.watchRoot) {
      const db = getDatabase();
      return db.watchRoots.resolveProjectForFile(entry.rootPath, filePath);
    }
    return null;
  }

  private isSafeWatchPath(entry: WatcherEntry, filePath: string): boolean {
    if (!assertPathContainedInRoot(entry.rootPath, filePath)) {
      return false;
    }
    try {
      const realRoot = fs.realpathSync(entry.rootPath);
      const realFile = fs.realpathSync(filePath);
      return assertPathContainedInRoot(realRoot, realFile);
    } catch {
      return false;
    }
  }
}
