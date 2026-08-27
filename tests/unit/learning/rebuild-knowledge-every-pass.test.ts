import { describe, it, expect, vi, beforeEach } from 'vitest';

const rebuildKnowledge = vi.fn();
const markDirty = vi.fn();
const evaluateSyncPolicy = vi.fn(() => ({ shouldSync: false, chaptersSinceSync: 0 }));
const syncDrive = vi.fn(() => Promise.resolve({ updated: true }));

vi.mock('@main/notebook/notebook-sync-service-singleton', () => ({
  getNotebookSyncService: () => ({
    rebuildKnowledge,
    markDirty,
    evaluateSyncPolicy,
    syncDrive,
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

vi.mock('@main/notebook/knowledge-builder', () => ({
  NotebookKnowledgeBuilder: class {
    buildAll() {
      return {
        '00_BOOK_PROFILE.md': 'p',
        '01_TRANSLATION_RULES.md': 'r',
        '02_PROJECT_TERMS.md': 't',
        '03_CHARACTERS.md': 'c',
        '04_RELATIONSHIPS.md': 'rel',
        '05_STORY_STATE.md': 's',
        '06_WORLD_KNOWLEDGE.md': 'w',
        '07_RECENT_CONTEXT.md': 'x',
        '08_SYNC_STATE.md': 'sync',
      };
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
  return {
    projects: {
      getById: () => ({
        id: PROJECT,
        title: 'Test',
        source_language: 'zh',
        target_language: 'vi',
      }),
    },
    chapters: { getByProjectAndNumber: () => null, listByProject: () => [] },
    characters: { listByProject: () => [], listAliases: () => [] },
    relationships: { listByProject: () => [] },
    terms: { listForMatching: () => [], listTranslations: () => [] },
    termCandidates: { listPendingForPack: () => [] },
    storyStates: { getByProject: () => null, parseStructured: () => null },
    memoryEvents: { listByProject: () => [], listRecentChapters: () => [] },
    learningEvents: { create: vi.fn() },
    driveSyncState: {
      ensure: () => ({
        chapters_since_sync: 0,
        sync_every_n_chapters: 10,
        critical_change_pending: 0,
      }),
      patch: vi.fn(),
    },
    notebooks: { listByProject: () => [] },
    knowledgeFiles: {
      maxLocalVersion: () => 1,
      listByProject: () => [],
    },
    getConnection: () => ({
      prepare: () => ({ all: () => [], get: () => null, run: () => undefined }),
    }),
  } as unknown as DatabaseManager;
}

describe('learning pipeline rebuildKnowledge every PASS', () => {
  beforeEach(() => {
    rebuildKnowledge.mockClear();
    markDirty.mockClear();
    evaluateSyncPolicy.mockClear();
    syncDrive.mockClear();
    evaluateSyncPolicy.mockReturnValue({ shouldSync: false, chaptersSinceSync: 0 });
  });

  it('rebuilds local knowledge even when shouldSync is false', async () => {
    await runLearningPipeline(mockDb(), {
      projectId: PROJECT,
      jobId: '33333333-3333-3333-3333-333333333333',
      chapterFrom: 1,
      chapterTo: 1,
      parsed: emptyParsed(),
    });

    expect(rebuildKnowledge).toHaveBeenCalledWith(PROJECT);
    expect(syncDrive).not.toHaveBeenCalled();
  });

  it('rebuilds then calls syncDrive when policy says sync', async () => {
    evaluateSyncPolicy.mockReturnValue({ shouldSync: true, chaptersSinceSync: 0 });
    await runLearningPipeline(mockDb(), {
      projectId: PROJECT,
      jobId: '33333333-3333-3333-3333-333333333334',
      chapterFrom: 2,
      chapterTo: 2,
      parsed: emptyParsed(),
    });

    expect(rebuildKnowledge).toHaveBeenCalledWith(PROJECT);
    expect(syncDrive).toHaveBeenCalledTimes(1);
    expect(syncDrive).toHaveBeenCalledWith(PROJECT);
  });
});
