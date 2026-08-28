import { describe, it, expect, vi, beforeEach } from 'vitest';

const rebuildKnowledge = vi.fn();

vi.mock('@main/notebook/notebook-sync-service-singleton', () => ({
  getNotebookSyncService: () => ({
    rebuildKnowledge,
  }),
}));

vi.mock('@main/learning/term-delta-processor', () => ({
  applyTermDelta: () => ({
    candidatesCreated: 0,
    candidatesMerged: 0,
    confirms: 0,
    rejected: 0,
    updates: 0,
    skipped: 0,
    occurrencesRecorded: 0,
    lockedTouched: 0,
  }),
}));

vi.mock('@main/memory/memory-delta-processor', () => ({
  applyMemoryDelta: () => ({
    applied: 0,
    skipped: 0,
    charactersTouched: 0,
    relationshipsTouched: 0,
    storyTouched: 0,
    worldTouched: 0,
    conflicts: [],
  }),
}));

vi.mock('@main/learning/memory-compactor', () => ({
  compactProjectMemory: () => ({
    archivedEvents: 0,
    pruned: 0,
  }),
}));

vi.mock('@main/notebook/knowledge-builder', () => ({
  NotebookKnowledgeBuilder: class {
    rebuildAndTrack() {
      return {};
    }
  },
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
  const edition = {
    id: 'ed-1',
    project_id: PROJECT,
    target_language: 'vi',
    name: 'vi',
    status: 'active',
    style_config: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  return {
    projects: {
      getById: () => ({
        id: PROJECT,
        title: 'Test',
        source_language: 'zh',
        target_language: 'vi',
        active_edition_id: edition.id,
      }),
      setActiveEditionId: vi.fn(),
    },
    translationEditions: {
      getById: () => edition,
      listByProject: () => [edition],
    },
    chapters: { getByProjectAndNumber: () => null, listByProject: () => [] },
    jobs: { getById: () => null },
    characters: { listByProject: () => [], listAliases: () => [] },
    relationships: { listByProject: () => [] },
    terms: { listForMatching: () => [], listTranslations: () => [] },
    termCandidates: { listPendingForPack: () => [] },
    storyStates: { getByProject: () => null, parseStructured: () => null },
    memoryEvents: { listByProject: () => [], listRecentChapters: () => [] },
    learningEvents: { create: vi.fn() },
    knowledgeSyncState: { patch: vi.fn(), ensure: () => ({}) },
    knowledgeSyncEvents: { insert: vi.fn() },
    knowledgeFiles: {
      maxLocalVersion: () => 1,
      listByProject: () => [],
      markDirty: vi.fn(),
    },
    getConnection: () => ({
      prepare: () => ({ all: () => [], get: () => null, run: () => undefined }),
      transaction: (fn: () => unknown) => () => fn(),
    }),
  } as unknown as DatabaseManager;
}

describe('learning pipeline rebuildKnowledge every PASS', () => {
  beforeEach(() => {
    rebuildKnowledge.mockClear();
  });

  it('rebuilds local knowledge on every PASS', async () => {
    await runLearningPipeline(mockDb(), {
      projectId: PROJECT,
      jobId: '33333333-3333-3333-3333-333333333333',
      chapterFrom: 1,
      chapterTo: 1,
      parsed: emptyParsed(),
    });

    expect(rebuildKnowledge).toHaveBeenCalledWith(PROJECT);
  });
});
