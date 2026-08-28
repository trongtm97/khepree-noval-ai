import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TranslationWorkspaceState {
  chapterRailCollapsed: boolean;
  contextCollapsed: boolean;
  focusMode: boolean;
  searchOpen: boolean;
  chapterRailWidth: number;
  contextWidth: number;
  toggleChapterRail: () => void;
  setChapterRailCollapsed: (v: boolean) => void;
  toggleContext: () => void;
  setContextCollapsed: (v: boolean) => void;
  toggleFocusMode: () => void;
  setFocusMode: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setChapterRailWidth: (w: number) => void;
  setContextWidth: (w: number) => void;
}

export const useTranslationWorkspaceStore = create<TranslationWorkspaceState>()(
  persist(
    (set) => ({
      chapterRailCollapsed: false,
      contextCollapsed: true,
      focusMode: false,
      searchOpen: false,
      chapterRailWidth: 200,
      contextWidth: 280,
      toggleChapterRail: () => set((s) => ({ chapterRailCollapsed: !s.chapterRailCollapsed })),
      setChapterRailCollapsed: (chapterRailCollapsed) => set({ chapterRailCollapsed }),
      toggleContext: () => set((s) => ({ contextCollapsed: !s.contextCollapsed })),
      setContextCollapsed: (contextCollapsed) => set({ contextCollapsed }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setFocusMode: (focusMode) => set({ focusMode }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setChapterRailWidth: (chapterRailWidth) =>
        set({ chapterRailWidth: Math.min(320, Math.max(160, chapterRailWidth)) }),
      setContextWidth: (contextWidth) =>
        set({ contextWidth: Math.min(420, Math.max(240, contextWidth)) }),
    }),
    {
      name: 'noveltrans-translation-workspace',
      partialize: (state) => ({
        chapterRailCollapsed: state.chapterRailCollapsed,
        contextCollapsed: state.contextCollapsed,
        chapterRailWidth: state.chapterRailWidth,
        contextWidth: state.contextWidth,
      }),
    },
  ),
);
