import { create } from 'zustand';

interface FeatureIntroUiState {
  tourRequestToken: number;
  requestTour: () => void;
}

export const useFeatureIntroUiStore = create<FeatureIntroUiState>((set) => ({
  tourRequestToken: 0,
  requestTour: () =>
    set((state) => ({
      tourRequestToken: state.tourRequestToken + 1,
    })),
}));
