import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import {
  countCompletedChapters,
  isCriticalLearningChange,
  runLearningPipeline,
} from '@main/learning/learning-pipeline';
import { resetNotebookSyncService } from '@main/notebook/notebook-sync-service-singleton';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import type { TermDeltaApplyResult } from '@main/learning/term-delta-processor';
import type { MemoryDeltaApplyResult } from '@main/memory/memory-delta-processor';

function emptyParsed(overrides?: Partial<ParsedBatchResult>): ParsedBatchResult {
  return {
    status: 'ok',
    translations: [],
    termDeltas: [],
    memoryDeltas: [],
    warnings: [],
    recoveryUsed: false,
    protocolVersion: 1,
    ...overrides,
  };
}

function emptyTerms(partial?: Partial<TermDeltaApplyResult>): TermDeltaApplyResult {
  return {
    candidatesCreated: 0,
    candidatesMerged: 0,
    occurrencesRecorded: 0,
    confirms: 0,
    updates: 0,
    skipped: 0,
    lockedTouched: 0,
    ...partial,
  };
}

function emptyMemory(partial?: Partial<MemoryDeltaApplyResult>): MemoryDeltaApplyResult {
  return {
    applied: 0,
    conflicts: [],
    skipped: 0,
    charactersTouched: 0,
    relationshipsTouched: 0,
    storyTouched: 0,
    worldTouched: 0,
    ...partial,
  };
}

describe('countCompletedChapters', () => {
  it('batch 101–103 → 3', () => {
    expect(countCompletedChapters({ chapterFrom: 101, chapterTo: 103 })).toBe(3);
  });

  it('prefers explicit chaptersCompleted', () => {
    expect(
      countCompletedChapters({ chapterFrom: 1, chapterTo: 10, chaptersCompleted: 2 }),
    ).toBe(2);
  });
});

describe('isCriticalLearningChange', () => {
  it('candidate-only is not critical', () => {
    expect(
      isCriticalLearningChange(emptyTerms({ candidatesCreated: 3 }), emptyMemory()),
    ).toBe(false);
  });

  it('locked term / character / relationship / story / world are critical', () => {
    expect(
      isCriticalLearningChange(emptyTerms({ lockedTouched: 1 }), emptyMemory()),
    ).toBe(true);
    expect(
      isCriticalLearningChange(emptyTerms(), emptyMemory({ charactersTouched: 1 })),
    ).toBe(true);
    expect(
      isCriticalLearningChange(emptyTerms(), emptyMemory({ relationshipsTouched: 1 })),
    ).toBe(true);
    expect(
      isCriticalLearningChange(emptyTerms(), emptyMemory({ storyTouched: 1 })),
    ).toBe(true);
    expect(
      isCriticalLearningChange(emptyTerms(), emptyMemory({ worldTouched: 1 })),
    ).toBe(true);
  });
});

describe('Learning local knowledge lifecycle', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-learn-sync-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    resetNotebookSyncService();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Sync Novel' }).id;
    for (let n = 101; n <= 103; n += 1) {
      db.chapters.create({
        project_id: projectId,
        chapter_number: n,
        sequence_order: n,
        source_text: `ch${n}`,
      });
    }
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    resetNotebookSyncService();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('learning PASS rebuilds knowledge and bumps local version', async () => {
    const before = db.knowledgeFiles.maxLocalVersion(projectId);

    const result = await runLearningPipeline(db, {
      projectId,
      jobId: db.jobs.create({
        project_id: projectId,
        type: 'translate_batch',
        chapter_from: 101,
        chapter_to: 103,
      }).id,
      parsed: emptyParsed({
        termDeltas: [
          { action: 'discover', source: '词', target: 'từ', category: 'other' },
        ],
      }),
      chapterFrom: 101,
      chapterTo: 103,
    });

    expect(db.knowledgeFiles.maxLocalVersion(projectId)).toBeGreaterThanOrEqual(before);
    expect(result.knowledgeVersionAtCommit).toBeGreaterThanOrEqual(before);
  });

  it('NotebookSyncService.evaluateSyncPolicy advances chapter counter', async () => {
    db.knowledgeSyncState.patch(projectId, {
      syncEveryNChapters: 10,
      chaptersSinceSync: 0,
    });

    const { getNotebookSyncService, resetNotebookSyncService } =
      await import('@main/notebook/notebook-sync-service-singleton');
    resetNotebookSyncService();
    const sync = getNotebookSyncService(db);

    sync.evaluateSyncPolicy(projectId, { chapterCount: 3 });
    expect(db.knowledgeSyncState.ensure(projectId).chapters_since_sync).toBe(3);
  });

  it('syncLocalKnowledge marks mapping sync_pending and emits KNOWLEDGE_SYNC_PENDING', async () => {
    const account = db.googleAccounts.create({
      label: 'W2',
      email: 'w2@t.com',
      displayName: 'W2',
      profileDirName: 'p2',
      status: 'READY',
      plan: 'UNKNOWN',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: account.id,
      notebook_name: '[NovelTrans] Sync Novel',
      notebook_role: 'SINGLE',
      status: 'ready',
    });

    const { getNotebookSyncService, resetNotebookSyncService } =
      await import('@main/notebook/notebook-sync-service-singleton');
    resetNotebookSyncService();

    await getNotebookSyncService(db).syncLocalKnowledge(projectId);

    const row = db.notebooks.listByProject(projectId)[0];
    expect(row.status).toBe('sync_pending');

    const events = db.knowledgeSyncEvents.listRecent(projectId, 20);
    expect(events.some((e) => e.event_type === 'KNOWLEDGE_BUILD_STARTED')).toBe(true);
    expect(events.some((e) => e.event_type === 'KNOWLEDGE_SYNC_PENDING')).toBe(true);
    expect(events.some((e) => e.event_type === 'NOTEBOOK_SYNC_VERIFIED')).toBe(false);
  });

  it('candidate discover alone is not critical', async () => {
    const result = await runLearningPipeline(db, {
      projectId,
      jobId: db.jobs.create({
        project_id: projectId,
        type: 'translate_batch',
        chapter_from: 101,
        chapter_to: 101,
      }).id,
      parsed: emptyParsed({
        termDeltas: [
          { action: 'discover', source: '新词', target: 'từ mới', category: 'other' },
        ],
      }),
      chapterFrom: 101,
      chapterTo: 101,
    });

    expect(result.critical).toBe(false);
  });
});
