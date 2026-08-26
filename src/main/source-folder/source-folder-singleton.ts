import { SourceFolderService } from './source-folder-service';
import { SourceWatcherManager } from './source-watcher-manager';

let serviceInstance: SourceFolderService | null = null;
let watcherInstance: SourceWatcherManager | null = null;

export function initializeSourceFolderService(): SourceFolderService {
  serviceInstance = new SourceFolderService();
  watcherInstance = new SourceWatcherManager(serviceInstance);
  return serviceInstance;
}

export function getSourceFolderService(): SourceFolderService {
  serviceInstance ??= new SourceFolderService();
  return serviceInstance;
}

export function getSourceWatcherManager(): SourceWatcherManager {
  watcherInstance ??= new SourceWatcherManager(getSourceFolderService());
  return watcherInstance;
}

export function startupSourceFolderSubsystem(): void {
  const service = getSourceFolderService();
  const watcher = getSourceWatcherManager();
  watcher.startAllEnabled();
  void service.startupRescanAll().then(() => {
    watcher.startAllEnabled();
  });
}

export function shutdownSourceFolderSubsystem(): void {
  watcherInstance?.stopAll();
}

export function resetSourceFolderForTests(): void {
  watcherInstance?.stopAll();
  serviceInstance = null;
  watcherInstance = null;
}
