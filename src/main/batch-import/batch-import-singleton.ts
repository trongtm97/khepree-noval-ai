import type { BatchImportProgressEventDto } from '@shared/schemas/batch-import';
import type { BrowserWindow } from 'electron';
import { BatchImportPreflightService } from './batch-import-preflight-service';
import { BatchImportCommitService } from './batch-import-commit-service';
import { emitBatchImportProgress, setBatchImportMainWindow } from './batch-import-event-bridge';

let preflightService: BatchImportPreflightService | null = null;
let commitService: BatchImportCommitService | null = null;

function bindProgress(service: { setProgressSink: (s: ((e: BatchImportProgressEventDto) => void) | null) => void }) {
  service.setProgressSink((event: BatchImportProgressEventDto) => {
    emitBatchImportProgress(event);
  });
}

export function initializeBatchImportPreflightService(): BatchImportPreflightService {
  if (!preflightService) {
    preflightService = new BatchImportPreflightService();
    bindProgress(preflightService);
  }
  if (!commitService) {
    commitService = new BatchImportCommitService(preflightService);
    bindProgress(commitService);
  }
  return preflightService;
}

export function getBatchImportPreflightService(): BatchImportPreflightService {
  if (!preflightService) {
    return initializeBatchImportPreflightService();
  }
  return preflightService;
}

export function getBatchImportCommitService(): BatchImportCommitService {
  initializeBatchImportPreflightService();
  return commitService!;
}

export function bindBatchImportMainWindow(win: BrowserWindow | null): void {
  setBatchImportMainWindow(win);
  initializeBatchImportPreflightService();
}

export function resetBatchImportPreflightServiceForTests(): void {
  preflightService = null;
  commitService = null;
  setBatchImportMainWindow(null);
}

export { BatchImportPreflightService, BatchImportCommitService };
