import { useTranslationEditorController } from '../features/translation/hooks/useTranslationEditorController';

/** Translation workspace route — orchestration only; logic lives in hooks. */
export function TranslationEditorPage() {
  return useTranslationEditorController();
}
