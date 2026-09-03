import { getDatabase } from '../db/connection';
import { UiLanguageService } from './ui-language-service';

let service: UiLanguageService | null = null;

export function getUiLanguageService(): UiLanguageService {
  service ??= new UiLanguageService(() => getDatabase());
  return service;
}

export function resetUiLanguageServiceForTests(): void {
  service = null;
}
