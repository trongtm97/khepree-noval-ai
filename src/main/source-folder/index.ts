export { detectChapterFile, detectChapterFromFilename, computeFileFingerprint } from './chapter-file-detector';
export { scanSourceFolder, chapterRowToSnapshot } from './folder-scanner';
export { computeLineDiff } from './source-diff';
export { SourceFolderService } from './source-folder-service';
export { SourceWatcherManager } from './source-watcher-manager';
export {
  getSourceFolderService,
  getSourceWatcherManager,
  initializeSourceFolderService,
  startupSourceFolderSubsystem,
  shutdownSourceFolderSubsystem,
} from './source-folder-singleton';
