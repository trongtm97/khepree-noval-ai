import { describe, expect, it } from 'vitest';
import type { ProjectDto } from '@shared/schemas/import';
import {
  projectProgressPercent,
  resolveProjectDisplayState,
  sortProjectsByProgress,
} from '../../../../src/renderer/features/projects/project-status';

const baseProject: ProjectDto = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Test',
  sourceLanguage: 'zh-Hans',
  targetLanguage: 'vi',
  genre: null,
  description: null,
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  sourceChapterCount: 100,
  translatedChapterCount: 25,
  health: {
    source: 'ok',
    google: 'ok',
    notebook: 'ok',
    memoryVersion: 1,
    memoryVerified: true,
  },
};

describe('project-status', () => {
  it('maps draft with source ok to ready', () => {
    const state = resolveProjectDisplayState(baseProject);
    expect(state.status).toBe('ready');
    expect(state.labelKey).toBe('projects.statusReady');
  });

  it('maps missing source to needs_setup', () => {
    const health = baseProject.health ?? {
      notebook: 'ok' as const,
      google: 'ok' as const,
      source: 'ok' as const,
      memoryVersion: null,
      memoryVerified: false,
    };
    const state = resolveProjectDisplayState({
      ...baseProject,
      health: {
        notebook: health.notebook,
        google: health.google,
        memoryVersion: health.memoryVersion,
        memoryVerified: health.memoryVerified,
        source: 'missing',
      },
    });
    expect(state.status).toBe('needs_setup');
    expect(state.hintKey).toBe('projects.hintNoSourceFolder');
  });

  it('maps completed when all chapters translated', () => {
    const state = resolveProjectDisplayState({
      ...baseProject,
      translatedChapterCount: 100,
    });
    expect(state.status).toBe('completed');
  });

  it('computes progress percent from translated/total', () => {
    expect(projectProgressPercent(baseProject)).toBe(25);
  });

  it('sorts by progress ratio not raw chapter count', () => {
    const lowPct: ProjectDto = {
      ...baseProject,
      id: '22222222-2222-4222-8222-222222222222',
      sourceChapterCount: 200,
      translatedChapterCount: 20,
    };
    const highPct: ProjectDto = {
      ...baseProject,
      id: '33333333-3333-4333-8333-333333333333',
      sourceChapterCount: 50,
      translatedChapterCount: 25,
    };
    expect(sortProjectsByProgress(highPct, lowPct)).toBeLessThan(0);
  });
});
