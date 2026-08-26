import type { AutoPreprocessStep } from '@shared/constants/notebooklm-preprocess-auto';

export interface AutoPreprocessProgress {
  projectId: string;
  step: AutoPreprocessStep;
  message: string;
  mode: 'quick' | 'full' | null;
  updatedAt: number;
}

const byProject = new Map<string, AutoPreprocessProgress>();

export function setAutoPreprocessProgress(
  projectId: string,
  step: AutoPreprocessStep,
  message: string,
  mode: 'quick' | 'full' | null = null,
): void {
  const prev = byProject.get(projectId);
  byProject.set(projectId, {
    projectId,
    step,
    message,
    mode: mode ?? prev?.mode ?? null,
    updatedAt: Date.now(),
  });
}

export function getAutoPreprocessProgress(
  projectId: string,
): AutoPreprocessProgress | null {
  return byProject.get(projectId) ?? null;
}

export function clearAutoPreprocessProgress(projectId: string): void {
  byProject.delete(projectId);
}
