import { describe, expect, it } from 'vitest';
import { useTranslationWorkspaceStore } from '../../../src/renderer/stores/translation-workspace-store';

/** Mirrors store partialize — update if persist policy changes. */
function persistSlice(state: ReturnType<typeof useTranslationWorkspaceStore.getState>) {
  return {
    chapterRailCollapsed: state.chapterRailCollapsed,
    contextCollapsed: state.contextCollapsed,
    chapterRailWidth: state.chapterRailWidth,
    contextWidth: state.contextWidth,
  };
}

describe('translation-workspace-store defaults', () => {
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
      chapterRailWidth: 200,
      contextWidth: 280,
    });
    expect(slice).not.toHaveProperty('focusMode');
    expect(slice).not.toHaveProperty('searchOpen');
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
