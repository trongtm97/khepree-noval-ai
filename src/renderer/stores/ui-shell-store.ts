import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiShellState {
  sidebarCollapsed: boolean;
  sidebarPinned: boolean;
  density: 'comfortable' | 'compact';
  currentProjectId: string | null;
  currentProjectName: string | null;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarPinned: (v: boolean) => void;
  setDensity: (d: 'comfortable' | 'compact') => void;
  setCurrentProject: (id: string | null, name: string | null) => void;
}

export const useUiShellStore = create<UiShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarPinned: true,
      density: 'comfortable',
      currentProjectId: null,
      currentProjectName: null,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarPinned: (sidebarPinned) => set({ sidebarPinned }),
      setDensity: (density) => {
        document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
        set({ density });
      },
      setCurrentProject: (currentProjectId, currentProjectName) =>
        set({ currentProjectId, currentProjectName }),
    }),
    { name: 'noveltrans-ui-shell' },
  ),
);

export function applyDensity(density: 'comfortable' | 'compact'): void {
  document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
}
