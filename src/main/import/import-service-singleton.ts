import { ImportService } from './import-service';

let instance: ImportService | null = null;

export function initializeImportService(): ImportService {
  instance = new ImportService();
  return instance;
}

export function getImportService(): ImportService {
  instance ??= new ImportService();
  return instance;
}
