import { describe, expect, it, afterEach } from 'vitest';
import { useTranslationWorkspaceStore } from '../../../src/renderer/stores/translation-workspace-store';

/** Mirrors store partialize — update if persist policy changes. */
function persistSlice(state: ReturnType<typeof useTranslationWorkspaceStore.getState>) {
  return {
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
  };
}

function resetStore() {
  useTranslationWorkspaceStore.setState({
    chapterRailCollapsed: false,
    contextCollapsed: true,
    focusMode: false,
    searchOpen: false,
    chapterRailWidth: 185,
    contextWidth: 260,
    editorSplitRatio: 0.48,
    readingMode: false,
    qaReviewMode: false,
    editorFontPreset: 'md',
    autoAdvanceAfterTranslate: false,
    chapterListScrollByProject: {},
  });
}

describe('translation-workspace-store defaults', () => {
  afterEach(resetStore);

  it('starts with context collapsed and search hidden', () => {
    const state = useTranslationWorkspaceStore.getState();
    expect(state.contextCollapsed).toBe(true);
    expect(state.searchOpen).toBe(false);
    expect(state.focusMode).toBe(false);
  });

  it('persist policy keeps layout prefs only', () => {
    const state = useTranslationWorkspaceStore.getState();
    state.setFocusMode(true);
    state.setSearchOpen(true);
    const slice = persistSlice(useTranslationWorkspaceStore.getState());
    expect(slice).toEqual({
      chapterRailCollapsed: false,
      contextCollapsed: true,
      chapterRailWidth: 185,
      contextWidth: 260,
      editorSplitRatio: 0.48,
      readingMode: false,
      qaReviewMode: false,
      editorFontPreset: 'md',
      autoAdvanceAfterTranslate: false,
      chapterListScrollByProject: {},
    });
    expect(slice).not.toHaveProperty('focusMode');
    expect(slice).not.toHaveProperty('searchOpen');
  });

  it('clamps context width to 240–360 and chapter rail to 160–320', () => {
    const state = useTranslationWorkspaceStore.getState();
    state.setContextWidth(200);
    expect(useTranslationWorkspaceStore.getState().contextWidth).toBe(240);
    state.setContextWidth(500);
    expect(useTranslationWorkspaceStore.getState().contextWidth).toBe(360);
    state.setChapterRailWidth(100);
    expect(useTranslationWorkspaceStore.getState().chapterRailWidth).toBe(160);
    state.setChapterRailWidth(400);
    expect(useTranslationWorkspaceStore.getState().chapterRailWidth).toBe(320);
  });

  it('stores chapter-list scroll per project', () => {
    const state = useTranslationWorkspaceStore.getState();
    state.setChapterListScroll('proj-a', 420);
    state.setChapterListScroll('proj-b', 12);
    expect(useTranslationWorkspaceStore.getState().chapterListScrollByProject).toEqual({
      'proj-a': 420,
      'proj-b': 12,
    });
  });

  it('clamps editor split ratio to 35–65%', () => {
    const state = useTranslationWorkspaceStore.getState();
    state.setEditorSplitRatio(0.2);
    expect(useTranslationWorkspaceStore.getState().editorSplitRatio).toBe(0.35);
    state.setEditorSplitRatio(0.9);
    expect(useTranslationWorkspaceStore.getState().editorSplitRatio).toBe(0.65);
  });
});

describe('translation shell acceptance', () => {
  it('marks translation focus paths', async () => {
    const { isTranslationFocusPath } = await import(
      '../../../src/renderer/routing/translation-route-resolver'
    );
    expect(isTranslationFocusPath('/translation')).toBe(true);
    expect(isTranslationFocusPath('/projects/p1/translate')).toBe(true);
    expect(isTranslationFocusPath('/projects/p1/info')).toBe(false);
  });
});
