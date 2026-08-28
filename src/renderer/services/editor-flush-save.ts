import type { EditorParagraphDto } from '@shared/schemas/translation-editor';

export interface FlushSaveInput {
  projectId: string;
  chapterId: string;
  dirty: Record<string, string>;
  paragraphs: EditorParagraphDto[];
  pendingTimers: Map<string, ReturnType<typeof setTimeout>>;
  onSaving: () => void;
  onSaved: (stableId: string, paragraph: EditorParagraphDto, savedAt: string) => void;
  onError: () => void;
}

/** Cancel debounced saves and persist all dirty paragraphs immediately. */
export async function flushEditorSaves(input: FlushSaveInput): Promise<boolean> {
  for (const timer of input.pendingTimers.values()) {
    clearTimeout(timer);
  }
  input.pendingTimers.clear();

  const entries = Object.entries(input.dirty);
  if (entries.length === 0) return true;

  input.onSaving();
  try {
    await Promise.all(
      entries.map(async ([stableParagraphId, translatedText]) => {
        const result = await window.novelTrans.editor.saveParagraph({
          projectId: input.projectId,
          chapterId: input.chapterId,
          stableParagraphId,
          translatedText,
        });
        input.onSaved(stableParagraphId, result.paragraph, result.savedAt);
      }),
    );
    return true;
  } catch {
    input.onError();
    return false;
  }
}
