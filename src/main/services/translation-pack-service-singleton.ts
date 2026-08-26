import { TranslationPackService } from './translation-pack-service';

let instance: TranslationPackService | null = null;

export function initializeTranslationPackService(): TranslationPackService {
  instance = new TranslationPackService();
  return instance;
}

export function getTranslationPackService(): TranslationPackService {
  instance ??= new TranslationPackService();
  return instance;
}
