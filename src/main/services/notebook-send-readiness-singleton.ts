import { NotebookSendReadinessService } from './notebook-send-readiness-service';
import { getDatabase } from '../db/connection';

let instance: NotebookSendReadinessService | null = null;

export function getNotebookSendReadinessService(): NotebookSendReadinessService {
  instance ??= new NotebookSendReadinessService(getDatabase());
  return instance;
}

export function resetNotebookSendReadinessServiceForTests(): void {
  instance = null;
}
