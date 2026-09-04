import { NotebookBindingService } from './notebook-binding-service';
import { getDatabase } from '../db/connection';

let instance: NotebookBindingService | null = null;

export function getNotebookBindingService(): NotebookBindingService {
  instance ??= new NotebookBindingService(getDatabase());
  return instance;
}

export function resetNotebookBindingServiceForTests(): void {
  instance?.clearCreateLocksForTests();
  instance = null;
}
