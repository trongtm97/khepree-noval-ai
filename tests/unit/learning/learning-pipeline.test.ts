import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { applyTermDelta } from '@main/learning/term-delta-processor';
import { runLearningPipeline } from '@main/learning/learning-pipeline';
import { compactProjectMemory } from '@main/learning/memory-compactor';
import { computeAdjustedConfidence } from '@main/learning/confidence';
import { LearningService } from '@main/services/learning-service';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';

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

describe('Learning pipeline (Phase 16)', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let projectId: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-learn-'));
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    projectId = db.projects.create({ title: 'Learn Novel' }).id;
    db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '李逍遥走进青云门。',
    });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('TERM_DELTA discover → candidate only (never GLOBAL_VERIFIED)', () => {
    const result = applyTermDelta(
      db,
      [
        {
          action: 'discover',
          source: '青云门',
          target: 'Thanh Vân Môn',
          category: 'place',
          confidence: 'high',
        },
      ],
      { projectId, chapterNumber: 1, sourceContext: '走进青云门' },
    );

    expect(result.candidatesCreated).toBe(1);
    const pending = db.termCandidates.listPending(projectId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.source_text).toBe('青云门');
    expect(pending[0]?.suggested_translation).toBe('Thanh Vân Môn');

    const globals = db.terms
      .search({ chinese: '青云门', limit: 10 })
      .filter((t) => t.status === 'GLOBAL_VERIFIED');
    expect(globals).toHaveLength(0);
  });

  it('duplicate discover merges candidate frequency', () => {
    applyTermDelta(
      db,
      [{ action: 'discover', source: '青云门', target: 'A', category: 'place' }],
      { projectId },
    );
    const second = applyTermDelta(
      db,
      [{ action: 'discover', source: '青云门', target: 'B', category: 'place' }],
      { projectId },
    );
    expect(second.candidatesMerged).toBe(1);
    expect(db.termCandidates.listPending(projectId)).toHaveLength(1);
    expect(db.termCandidates.listPending(projectId)[0]?.frequency).toBeGreaterThanOrEqual(2);
  });

  it('confirm → PROJECT_VERIFIED only, bumps occurrence + human_confirm', () => {
    applyTermDelta(
      db,
      [{ action: 'discover', source: '李逍遥', target: 'Lý Tiêu Dao', category: 'name' }],
      { projectId },
    );
    const result = applyTermDelta(
      db,
      [{ action: 'confirm', source: '李逍遥', target: 'Lý Tiêu Dao' }],
      { projectId, chapterNumber: 1, sourceContext: '李逍遥走进' },
    );
    expect(result.confirms).toBe(1);
    const term = db.terms.findBySource('李逍遥', projectId);
    expect(term?.status).toBe('PROJECT_VERIFIED');
    expect(term?.scope).toBe('PROJECT');
    expect(term?.occurrence_count).toBeGreaterThanOrEqual(1);
    expect(term?.human_confirm_count).toBeGreaterThanOrEqual(1);
    expect(term?.status).not.toBe('GLOBAL_VERIFIED');
  });

  it('MEMORY_DELTA applies non-conflicting; conflict when locked differs', async () => {
    db.memoryEvents.upsert({
      project_id: projectId,
      category: 'plot',
      event_key: 'arc',
      event_value: 'old',
      locked: true,
    });

    const parsed = emptyParsed({
      memoryDeltas: [
        {
          action: 'upsert',
          category: 'plot',
          key: 'arc',
          value: 'new conflicting',
        },
        {
          action: 'upsert',
          category: 'world',
          key: 'sect',
          value: '青云门',
        },
      ],
    });

    const learning = await runLearningPipeline(db, {
      projectId,
      jobId: db.jobs.create({
        project_id: projectId,
        type: 'translate_batch',
        state: 'QUEUED',
        chapter_from: 1,
        chapter_to: 1,
      }).id,
      parsed,
      chapterFrom: 1,
      chapterTo: 1,
    });

    expect(learning.memory.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(learning.memory.applied).toBeGreaterThanOrEqual(1);
    expect(db.memoryConflicts.listPending(projectId).length).toBeGreaterThanOrEqual(1);
    expect(db.memoryEvents.getByKey(projectId, 'world', 'sect')?.event_value).toContain('青云门');
  });

  it('rebuilds local knowledge markdown after learning deltas', async () => {
    db.knowledgeSyncState.patch(projectId, {
      syncEveryNChapters: 2,
      chaptersSinceSync: 1,
    });

    const job = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      chapter_from: 2,
      chapter_to: 2,
    });

    const beforeVersion = db.knowledgeFiles.maxLocalVersion(projectId);

    const result = await runLearningPipeline(db, {
      projectId,
      jobId: job.id,
      parsed: emptyParsed({
        termDeltas: [
          {
            action: 'discover',
            source: '玄铁',
            target: 'Huyền thiết',
            category: 'item',
          },
        ],
      }),
      chapterFrom: 2,
      chapterTo: 2,
    });

    expect(result.knowledgeVersionAtCommit).toBeGreaterThanOrEqual(beforeVersion);
    expect(db.knowledgeFiles.get(projectId, 'project_terms')).toBeTruthy();
  });

  it('archives old memory so current state stays compact', () => {
    for (let i = 1; i <= 25; i += 1) {
      db.memoryEvents.upsert({
        project_id: projectId,
        category: 'plot',
        event_key: `k${i}`,
        event_value: `v${i}`,
        chapter_number: i,
      });
    }
    db.storyStates.patch(projectId, { currentChapterNumber: 25 });

    const compact = compactProjectMemory(db, projectId, {
      currentChapter: 25,
      chapterWindow: 10,
    });
    expect(compact.archivedEvents).toBeGreaterThan(0);
    expect(db.memoryArchives.listByProject(projectId).length).toBeGreaterThanOrEqual(1);
    expect(db.memoryEvents.countByProject(projectId)).toBeLessThan(25);
  });

  it('confidence adjusts from occurrence / project / human — no auto GLOBAL', () => {
    const conf = computeAdjustedConfidence({
      confidence: 0.3,
      occurrence_count: 5,
      project_count: 2,
      human_confirm_count: 1,
      status: 'CANDIDATE',
    });
    expect(conf).toBeGreaterThan(0.3);
    expect(conf).toBeLessThanOrEqual(0.85);
  });

  it('Learning dashboard aggregates candidates, conflicts, memories', async () => {
    applyTermDelta(
      db,
      [{ action: 'discover', source: '新词', target: 'Từ mới', category: 'other' }],
      { projectId },
    );
    await runLearningPipeline(db, {
      projectId,
      jobId: db.jobs.create({ project_id: projectId, type: 't' }).id,
      parsed: emptyParsed({
        memoryDeltas: [
          { action: 'upsert', category: 'plot', key: 'hook', value: 'start' },
        ],
      }),
    });

    const dash = new LearningService(db).getDashboard(projectId);
    expect(dash.newTerms.length).toBeGreaterThanOrEqual(1);
    expect(dash.recentMemories.length).toBeGreaterThanOrEqual(1);
    expect(dash.stats.pendingCandidates).toBeGreaterThanOrEqual(1);
  });

  it('marks CHARACTER / RELATIONSHIP / RECENT_CONTEXT dirty after memory deltas', async () => {
    applyTermDelta(
      db,
      [{ action: 'discover', source: '青云门', target: 'Thanh Vân Môn', category: 'place' }],
      { projectId, chapterNumber: 1 },
    );

    const job = db.jobs.create({
      project_id: projectId,
      type: 'translate_batch',
      state: 'QUEUED',
      chapter_from: 1,
      chapter_to: 1,
    });

    const learning = await runLearningPipeline(db, {
      projectId,
      jobId: job.id,
      parsed: emptyParsed({
        memoryDeltas: [
          {
            action: 'upsert',
            category: 'character',
            key: '李逍遥',
            value: { translatedName: 'Lý Tiêu Dao', role: 'protagonist' },
          },
          {
            action: 'relationship',
            from: '李逍遥',
            to: '赵灵儿',
            type: 'friend',
          },
          {
            action: 'story_state',
            summaryText: 'Bắt đầu hành trình.',
          },
        ],
        termDeltas: [
          {
            action: 'confirm',
            source: '青云门',
            target: 'Thanh Vân Môn',
          },
        ],
      }),
      chapterFrom: 1,
      chapterTo: 1,
    });

    expect(learning.memory.charactersTouched).toBeGreaterThanOrEqual(1);
    expect(learning.memory.relationshipsTouched).toBeGreaterThanOrEqual(1);
    expect(learning.memory.storyTouched).toBeGreaterThanOrEqual(1);

    expect(db.knowledgeFiles.get(projectId, 'characters')?.dirty).toBe(1);
    expect(db.knowledgeFiles.get(projectId, 'relationships')?.dirty).toBe(1);
    expect(db.knowledgeFiles.get(projectId, 'recent_context')?.dirty).toBe(1);
    expect(db.knowledgeFiles.get(projectId, 'project_terms')?.dirty).toBe(1);
  });
});
