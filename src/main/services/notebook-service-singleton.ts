import { NotebookService } from './notebook-service';
import { getDatabase } from '../db/connection';

let instance: NotebookService | null = null;

export function initializeNotebookService(): NotebookService {
  instance = new NotebookService(getDatabase());
  return instance;
}

export function getNotebookService(): NotebookService {
  instance ??= new NotebookService(getDatabase());
  return instance;
}

export function resetNotebookServiceForTests(): void {
  instance = null;
}
