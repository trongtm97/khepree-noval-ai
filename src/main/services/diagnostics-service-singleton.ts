import { DiagnosticsService } from './diagnostics-service';
import { getDatabase } from '../db/connection';

let instance: DiagnosticsService | null = null;

export function getDiagnosticsService(): DiagnosticsService {
  instance ??= new DiagnosticsService(() => getDatabase());
  return instance;
}

export function resetDiagnosticsServiceForTests(): void {
  instance = null;
}
