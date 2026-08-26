import { PortabilityService } from './portability-service';
import { getDatabase } from '../db/connection';

let instance: PortabilityService | null = null;

export function getPortabilityService(): PortabilityService {
  instance ??= new PortabilityService(
    () => getDatabase(),
    () => getDatabase().dbPath,
  );
  return instance;
}

export function resetPortabilityServiceForTests(): void {
  instance = null;
}
