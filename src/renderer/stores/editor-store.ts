import { create } from 'zustand';
import type { EditorParagraphDto } from '@shared/schemas/translation-editor';
import type { EditorContextResponseSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import { pushUndo, popUndo, popRedo, type UndoStacks } from '../utils/editor-undo';

type EditorContext = z.infer<typeof EditorContextResponseSchema>;

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface EditorState {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  paragraphs: EditorParagraphDto[];
  activeParagraphId: string | null;
  dirty: Record<string, string>;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  context: EditorContext | null;
  undoStacks: UndoStacks;
  setChapter: (
    projectId: string,
    chapterId: string,
    chapterNumber: number,
    paragraphs: EditorParagraphDto[],
    chapterTitle?: string | null,
  ) => void;
  setActiveParagraph: (stableId: string | null) => void;
  updateDraft: (stableId: string, text: string) => void;
  markSaving: () => void;
  markSaved: (stableId: string, paragraph: EditorParagraphDto, savedAt: string) => void;
  markSaveError: () => void;
  setContext: (context: EditorContext) => void;
  applyUndo: () => UndoStacks['undo'][number] | null;
  applyRedo: () => UndoStacks['undo'][number] | null;
  recordUndo: (stableId: string, before: string, after: string) => void;
  patchParagraph: (paragraph: EditorParagraphDto) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: '',
  chapterId: '',
  chapterNumber: 1,
  chapterTitle: null,
  paragraphs: [],
  activeParagraphId: null,
  dirty: {},
  saveStatus: 'idle',
  lastSavedAt: null,
  context: null,
  undoStacks: { undo: [], redo: [] },

  setChapter: (projectId, chapterId, chapterNumber, paragraphs, chapterTitle = null) => {
    set({
      projectId,
      chapterId,
      chapterNumber,
      chapterTitle,
      paragraphs,
      activeParagraphId: paragraphs[0]?.stableParagraphId ?? null,
      dirty: {},
      saveStatus: 'idle',
      lastSavedAt: null,
      undoStacks: { undo: [], redo: [] },
    });
  },

  setActiveParagraph: (stableId) => { set({ activeParagraphId: stableId }); },

  updateDraft: (stableId, text) => {
    const para = get().paragraphs.find((p) => p.stableParagraphId === stableId);
    const baseline = para?.translatedText ?? '';
    if (text === baseline) {
      const nextDirty = Object.fromEntries(
        Object.entries(get().dirty).filter(([key]) => key !== stableId),
      );
      set({
        dirty: nextDirty,
        saveStatus: Object.keys(nextDirty).length > 0 ? 'dirty' : 'idle',
      });
      return;
    }
    const dirty = { ...get().dirty, [stableId]: text };
    set({
      dirty,
      saveStatus: 'dirty',
    });
  },

  markSaving: () => { set({ saveStatus: 'saving' }); },

  markSaved: (stableId, paragraph, savedAt) => {
    const nextDirty = Object.fromEntries(
      Object.entries(get().dirty).filter(([key]) => key !== stableId),
    );
    set((state) => ({
      paragraphs: state.paragraphs.map((p) =>
        p.stableParagraphId === stableId ? paragraph : p,
      ),
      dirty: nextDirty,
      saveStatus: Object.keys(nextDirty).length > 0 ? 'dirty' : 'saved',
      lastSavedAt: savedAt,
    }));
  },

  markSaveError: () => { set({ saveStatus: 'error' }); },

  setContext: (context) => { set({ context }); },

  recordUndo: (stableId, before, after) => {
    if (before === after) return;
    set((state) => ({
      undoStacks: pushUndo(state.undoStacks, {
        stableParagraphId: stableId,
        before,
        after,
      }),
    }));
  },

  applyUndo: () => {
    const { stacks, entry } = popUndo(get().undoStacks);
    if (!entry) return null;
    set({ undoStacks: stacks });
    get().updateDraft(entry.stableParagraphId, entry.before);
    return entry;
  },

  applyRedo: () => {
    const { stacks, entry } = popRedo(get().undoStacks);
    if (!entry) return null;
    set({ undoStacks: stacks });
    get().updateDraft(entry.stableParagraphId, entry.after);
    return entry;
  },

  patchParagraph: (paragraph) => {
    set((state) => ({
      paragraphs: state.paragraphs.map((p) =>
        p.stableParagraphId === paragraph.stableParagraphId ? paragraph : p,
      ),
    }));
  },
}));
