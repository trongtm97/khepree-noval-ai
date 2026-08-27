import { AiProviderService } from './ai-provider-service';
import { getDatabase } from '../db/connection';
import { getGeminiService } from '../services/gemini-service-singleton';
import { getSecretStorage } from '../security';

let instance: AiProviderService | null = null;

export function initializeAiProviderService(): AiProviderService {
  instance = new AiProviderService(
    getDatabase(),
    getGeminiService(),
    getSecretStorage(),
  );
  return instance;
}

export function getAiProviderService(): AiProviderService {
  instance ??= initializeAiProviderService();
  return instance;
}

export function resetAiProviderServiceForTests(): void {
  instance = null;
}

export async function shutdownAiProviderService(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
  }
}
