import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CHAPTER_RAIL_DEFAULT,
  CONTEXT_PANEL_DEFAULT,
  clampChapterRailWidth,
  clampContextPanelWidth,
} from '../utils/translation-workspace-layout';

export type EditorFontPreset = 'sm' | 'md' | 'lg';

interface TranslationWorkspaceState {
  chapterRailCollapsed: boolean;
  contextCollapsed: boolean;
  focusMode: boolean;
  searchOpen: boolean;
  chapterRailWidth: number;
  contextWidth: number;
  editorSplitRatio: number;
  readingMode: boolean;
  qaReviewMode: boolean;
  editorFontPreset: EditorFontPreset;
  autoAdvanceAfterTranslate: boolean;
  toggleChapterRail: () => void;
  setChapterRailCollapsed: (v: boolean) => void;
  toggleContext: () => void;
  setContextCollapsed: (v: boolean) => void;
  toggleFocusMode: () => void;
  setFocusMode: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setChapterRailWidth: (w: number) => void;
  setContextWidth: (w: number) => void;
  setEditorSplitRatio: (ratio: number) => void;
  toggleReadingMode: () => void;
  setReadingMode: (v: boolean) => void;
  toggleQaReviewMode: () => void;
  setQaReviewMode: (v: boolean) => void;
  setEditorFontPreset: (preset: EditorFontPreset) => void;
  setAutoAdvanceAfterTranslate: (v: boolean) => void;
  chapterListScrollByProject: Record<string, number>;
  setChapterListScroll: (projectId: string, offset: number) => void;
}

function clampSplitRatio(ratio: number): number {
  return Math.min(0.65, Math.max(0.35, ratio));
}

export const useTranslationWorkspaceStore = create<TranslationWorkspaceState>()(
  persist(
    (set) => ({
      chapterRailCollapsed: false,
      contextCollapsed: true,
      focusMode: false,
      searchOpen: false,
      chapterRailWidth: CHAPTER_RAIL_DEFAULT,
      contextWidth: CONTEXT_PANEL_DEFAULT,
      editorSplitRatio: 0.48,
      readingMode: false,
      qaReviewMode: false,
      editorFontPreset: 'md',
      autoAdvanceAfterTranslate: false,
      toggleChapterRail: () => set((s) => ({ chapterRailCollapsed: !s.chapterRailCollapsed })),
      setChapterRailCollapsed: (chapterRailCollapsed) => set({ chapterRailCollapsed }),
      toggleContext: () => set((s) => ({ contextCollapsed: !s.contextCollapsed })),
      setContextCollapsed: (contextCollapsed) => set({ contextCollapsed }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setFocusMode: (focusMode) => set({ focusMode }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setChapterRailWidth: (chapterRailWidth) =>
        set({ chapterRailWidth: clampChapterRailWidth(chapterRailWidth) }),
      setContextWidth: (contextWidth) =>
        set({ contextWidth: clampContextPanelWidth(contextWidth) }),
      setEditorSplitRatio: (editorSplitRatio) =>
        set({ editorSplitRatio: clampSplitRatio(editorSplitRatio) }),
      toggleReadingMode: () => set((s) => ({ readingMode: !s.readingMode })),
      setReadingMode: (readingMode) => set({ readingMode }),
      toggleQaReviewMode: () => set((s) => ({ qaReviewMode: !s.qaReviewMode })),
      setQaReviewMode: (qaReviewMode) => set({ qaReviewMode }),
      setEditorFontPreset: (editorFontPreset) => set({ editorFontPreset }),
      setAutoAdvanceAfterTranslate: (autoAdvanceAfterTranslate) =>
        set({ autoAdvanceAfterTranslate }),
      chapterListScrollByProject: {},
      setChapterListScroll: (projectId, offset) =>
        set((s) => ({
          chapterListScrollByProject: {
            ...s.chapterListScrollByProject,
            [projectId]: offset,
          },
        })),
    }),
    {
      name: 'noveltrans-translation-workspace',
      version: 3,
      migrate: (persisted, version) => {
        const slice = persisted as {
          chapterRailCollapsed?: boolean;
          contextCollapsed?: boolean;
          chapterRailWidth?: number;
          contextWidth?: number;
          editorSplitRatio?: number;
          readingMode?: boolean;
          qaReviewMode?: boolean;
          editorFontPreset?: EditorFontPreset;
          autoAdvanceAfterTranslate?: boolean;
          chapterListScrollByProject?: Record<string, number>;
        };
        const base = {
          chapterRailCollapsed: slice.chapterRailCollapsed ?? false,
          contextCollapsed: slice.contextCollapsed ?? true,
          chapterRailWidth: clampChapterRailWidth(slice.chapterRailWidth ?? CHAPTER_RAIL_DEFAULT),
          contextWidth: clampContextPanelWidth(slice.contextWidth ?? CONTEXT_PANEL_DEFAULT),
          chapterListScrollByProject: slice.chapterListScrollByProject ?? {},
        };
        if (version < 2) {
          return base;
        }
        if (version < 3) {
          return {
            ...base,
            editorSplitRatio: clampSplitRatio(slice.editorSplitRatio ?? 0.48),
            readingMode: slice.readingMode ?? false,
            qaReviewMode: slice.qaReviewMode ?? false,
            editorFontPreset: slice.editorFontPreset ?? 'md',
            autoAdvanceAfterTranslate: slice.autoAdvanceAfterTranslate ?? false,
          };
        }
        return {
          ...base,
          editorSplitRatio: clampSplitRatio(slice.editorSplitRatio ?? 0.48),
          readingMode: slice.readingMode ?? false,
          qaReviewMode: slice.qaReviewMode ?? false,
          editorFontPreset: slice.editorFontPreset ?? 'md',
          autoAdvanceAfterTranslate: slice.autoAdvanceAfterTranslate ?? false,
        };
      },
      partialize: (state) => ({
        chapterRailCollapsed: state.chapterRailCollapsed,
        contextCollapsed: state.contextCollapsed,
        chapterRailWidth: state.chapterRailWidth,
        contextWidth: state.contextWidth,
        editorSplitRatio: state.editorSplitRatio,
        readingMode: state.readingMode,
        qaReviewMode: state.qaReviewMode,
        editorFontPreset: state.editorFontPreset,
        autoAdvanceAfterTranslate: state.autoAdvanceAfterTranslate,
        chapterListScrollByProject: state.chapterListScrollByProject,
      }),
    },
  ),
);
