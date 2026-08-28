import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiShellState {
  sidebarCollapsed: boolean;
  sidebarPinned: boolean;
  density: 'comfortable' | 'compact';
  showAdvancedTools: boolean;
  showParagraphIds: boolean;
  currentProjectId: string | null;
  currentProjectName: string | null;
  lastTranslationProjectId: string | null;
  lastTranslationChapterId: string | null;
  projectsViewMode: 'list' | 'grid';
  dashboardReadyShown: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarPinned: (v: boolean) => void;
  setDensity: (d: 'comfortable' | 'compact') => void;
  setShowAdvancedTools: (v: boolean) => void;
  setShowParagraphIds: (v: boolean) => void;
  setCurrentProject: (id: string | null, name: string | null) => void;
  setLastTranslationSession: (projectId: string | null, chapterId?: string | null) => void;
  setProjectsViewMode: (mode: 'list' | 'grid') => void;
  setDashboardReadyShown: (v: boolean) => void;
}

export const useUiShellStore = create<UiShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarPinned: true,
      density: 'comfortable',
      showAdvancedTools: false,
      showParagraphIds: false,
      currentProjectId: null,
      currentProjectName: null,
      lastTranslationProjectId: null,
      lastTranslationChapterId: null,
      projectsViewMode: 'list',
      dashboardReadyShown: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarPinned: (sidebarPinned) => set({ sidebarPinned }),
      setDensity: (density) => {
        document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
        set({ density });
      },
      setShowAdvancedTools: (showAdvancedTools) => set({ showAdvancedTools }),
      setShowParagraphIds: (showParagraphIds) => set({ showParagraphIds }),
      setCurrentProject: (currentProjectId, currentProjectName) =>
        set({ currentProjectId, currentProjectName }),
      setLastTranslationSession: (lastTranslationProjectId, chapterId) =>
        set((state) => ({
          lastTranslationProjectId,
          ...(chapterId !== undefined
            ? { lastTranslationChapterId: chapterId }
            : state.lastTranslationProjectId !== lastTranslationProjectId
              ? { lastTranslationChapterId: null }
              : {}),
        })),
      setProjectsViewMode: (projectsViewMode) => set({ projectsViewMode }),
      setDashboardReadyShown: (dashboardReadyShown) => set({ dashboardReadyShown }),
    }),
    { name: 'noveltrans-ui-shell' },
  ),
);

export function applyDensity(density: 'comfortable' | 'compact'): void {
  document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
}
