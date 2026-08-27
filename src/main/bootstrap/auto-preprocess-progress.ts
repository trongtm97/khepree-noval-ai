import type { AutoPreprocessStep } from '@shared/constants/notebooklm-preprocess-auto';
import type { FullNovelPreprocessStage } from '@shared/constants/full-novel-preprocess';

export interface AutoPreprocessResult {
  mode: 'quick' | 'full';
  status: 'completed' | 'completed_with_warnings' | 'failed' | 'needs_assisted';
  message: string;
  foundKeys: string[];
  needsAssisted: boolean;
  steps: string[];
  accountId: string | null;
}

export interface AutoPreprocessProgressCounts {
  stage?: FullNovelPreprocessStage;
  packingDone?: number;
  packingTotal?: number;
  sourcesUploaded?: number;
  sourcesTotal?: number;
  sourcesReady?: number;
  sourcesIndexing?: number;
  sourcesError?: number;
}

export interface AutoPreprocessProgress {
  projectId: string;
  step: AutoPreprocessStep;
  message: string;
  mode: 'quick' | 'full' | null;
  updatedAt: number;
  counts: AutoPreprocessProgressCounts | null;
}

const byProject = new Map<string, AutoPreprocessProgress>();

export function setAutoPreprocessProgress(
  projectId: string,
  step: AutoPreprocessStep,
  message: string,
  mode: 'quick' | 'full' | null = null,
  counts: AutoPreprocessProgressCounts | null = null,
): void {
  const prev = byProject.get(projectId);
  byProject.set(projectId, {
    projectId,
    step,
    message,
    mode: mode ?? prev?.mode ?? null,
    updatedAt: Date.now(),
    counts: counts ?? prev?.counts ?? null,
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
