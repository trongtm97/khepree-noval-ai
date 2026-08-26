import { GeminiService } from './gemini-service';
import { getDatabase } from '../db/connection';

let instance: GeminiService | null = null;

export function initializeGeminiService(): GeminiService {
  instance = new GeminiService(getDatabase());
  return instance;
}

export function getGeminiService(): GeminiService {
  instance ??= new GeminiService(getDatabase());
  return instance;
}

export function resetGeminiServiceForTests(): void {
  instance = null;
}
