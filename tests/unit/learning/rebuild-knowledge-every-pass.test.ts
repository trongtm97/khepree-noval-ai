import { describe, it, expect, vi, beforeEach } from 'vitest';

const rebuildKnowledge = vi.fn();
const markDirty = vi.fn();

vi.mock('@main/notebook/notebook-sync-service-singleton', () => ({
  getNotebookSyncService: () => ({
    rebuildKnowledge,
    markDirty,
  }),
}));

vi.mock('@main/learning/term-delta-processor', () => ({
  applyTermDelta: () => ({
    candidatesCreated: 0,
    candidatesMerged: 0,
    confirms: 0,
    rejected: 0,
  }),
}));

vi.mock('@main/memory/memory-delta-processor', () => ({
  applyMemoryDelta: () => ({
    applied: 0,
    skipped: 0,
    charactersTouched: 0,
    relationshipsTouched: 0,
    storyTouched: 0,
    conflicts: [],
  }),
}));

vi.mock('@main/learning/memory-compactor', () => ({
  compactProjectMemory: () => ({
    archivedEvents: 0,
    pruned: 0,
  }),
}));

vi.mock('@main/drive/drive-content-builder', () => ({
  buildProjectDriveDocuments: () => ({
    '02_PROJECT_TERMS.md': 't',
    '03_CHARACTERS.md': 'c',
    '04_RELATIONSHIPS.md': 'r',
    '05_STORY_STATE.md': 's',
    '06_WORLD_KNOWLEDGE.md': 'w',
    '07_RECENT_CONTEXT.md': 'x',
  }),
}));

import { runLearningPipeline } from '@main/learning/learning-pipeline';
import type { DatabaseManager } from '@main/db/database-manager';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';

const PROJECT = '11111111-1111-1111-1111-111111111111';

function emptyParsed(): ParsedBatchResult {
  return {
    status: 'ok',
    translations: [],
    termDeltas: [],
    memoryDeltas: [],
    warnings: [],
    recoveryUsed: false,
    protocolVersion: 1,
  };
}

function mockDb(): DatabaseManager {
  return {
    chapters: { getByProjectAndNumber: () => null },
    learningEvents: { create: vi.fn() },
    driveSyncState: {
      ensure: () => ({
        chapters_since_sync: 0,
        sync_every_n_chapters: 10,
        critical_change_pending: 0,
      }),
      patch: vi.fn(),
    },
  } as unknown as DatabaseManager;
}

describe('learning pipeline rebuildKnowledge every PASS', () => {
  beforeEach(() => {
    rebuildKnowledge.mockClear();
    markDirty.mockClear();
  });

  it('rebuilds local knowledge even when shouldSync is false', async () => {
    await runLearningPipeline(mockDb(), {
      projectId: PROJECT,
      jobId: '33333333-3333-3333-3333-333333333333',
      chapterFrom: 1,
      chapterTo: 1,
      parsed: emptyParsed(),
      onChapterCompleted: () => ({ shouldSync: false }),
    });

    expect(rebuildKnowledge).toHaveBeenCalledWith(PROJECT);
  });

  it('rebuilds even when consolidating for Drive sync', async () => {
    await runLearningPipeline(mockDb(), {
      projectId: PROJECT,
      jobId: '33333333-3333-3333-3333-333333333334',
      chapterFrom: 2,
      chapterTo: 2,
      parsed: emptyParsed(),
      onChapterCompleted: () => ({ shouldSync: true }),
      syncProject: vi.fn(async () => undefined),
    });

    expect(rebuildKnowledge).toHaveBeenCalledWith(PROJECT);
  });
});
