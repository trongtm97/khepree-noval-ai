import { TabularImportService } from '../tabular/tabular-import-service';

let instance: TabularImportService | null = null;

export function getTabularService(): TabularImportService {
  instance ??= new TabularImportService();
  return instance;
}
