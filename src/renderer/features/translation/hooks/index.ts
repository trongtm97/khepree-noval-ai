export { useTranslationEditorController } from './useTranslationEditorController';

/**
 * Translation editor hooks are composed inside useTranslationEditorController.
 * Logical sections map to:
 * - useTranslationProject — project/chapter load & session persistence
 * - useChapterNavigation — chapter index & multi-select
 * - useTranslationJob — enqueue, watch, progress
 * - useTranslationPreflight — ensure-ready & worker/notebook gates
 * - useTranslationSearch — find/replace overlay state
 * - useChapterQuickActions — copy, export, flush-before-export
 */
