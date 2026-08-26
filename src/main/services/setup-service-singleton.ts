import { SetupService } from './setup-service';
import { getDatabase } from '../db/connection';

let instance: SetupService | null = null;

export function getSetupService(): SetupService {
  instance ??= new SetupService(() => getDatabase());
  return instance;
}

export function resetSetupServiceForTests(): void {
  instance = null;
}
