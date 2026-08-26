import { MemoryService } from './memory-service';

let instance: MemoryService | null = null;

export function initializeMemoryService(): MemoryService {
  instance = new MemoryService();
  return instance;
}

export function getMemoryService(): MemoryService {
  instance ??= new MemoryService();
  return instance;
}
