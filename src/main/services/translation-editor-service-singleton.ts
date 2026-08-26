import { TranslationEditorService } from './translation-editor-service';
import { getDatabase } from '../db/connection';

let instance: TranslationEditorService | null = null;

export function getTranslationEditorService(): TranslationEditorService {
  instance ??= new TranslationEditorService(getDatabase());
  return instance;
}

export function resetTranslationEditorServiceForTests(): void {
  instance = null;
}
