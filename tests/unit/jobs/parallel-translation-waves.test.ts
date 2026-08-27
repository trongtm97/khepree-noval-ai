import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import {
  PARALLEL_WAVES_DEFAULT_ENABLED,
  PARALLEL_WAVES_FEATURE_KEY,
  PARALLEL_WAVES_UI_WARNING_VI,
} from '@shared/constants/parallel-waves';
import {
  assignWaveOrderIndices,
  validateWaveConsistency,
  stripConflictingDeltas,
} from '@main/jobs/wave-consistency-validator';
import {
  createTranslationWave,
  isParallelWavesEnabled,
  setParallelWavesEnabled,
  storeWaveProvisional,
  tryAdvanceWaveCommit,
} from '@main/jobs/wave-service';

function emptyParsed(overrides?: Partial<ParsedBatchResult>): ParsedBatchResult {
  return {
    status: 'ok',
    translations: [{ paragraphId: '[C000001:P000001]', text: 'Xin chào.' }],
    termDeltas: [],
    memoryDeltas: [],
    warnings: [],
    recoveryUsed: false,
    protocolVersion: 1,
    ...overrides,
  };
}

describe('Parallel Translation Waves', () => {
  let db: DatabaseManager;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-waves-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('feature defaults OFF', () => {
    expect(PARALLEL_WAVES_DEFAULT_ENABLED).toBe(false);
    expect(isParallelWavesEnabled(db)).toBe(false);
    expect(db.appMeta.get(PARALLEL_WAVES_FEATURE_KEY)).toBeNull();
    expect(PARALLEL_WAVES_UI_WARNING_VI).toContain('nhất quán');
  });

  it('assignWaveOrderIndices is deterministic by chapter_from then jobId', () => {
    const a = assignWaveOrderIndices([
      { jobId: 'job-c', chapterFrom: 107 },
      { jobId: 'job-a', chapterFrom: 101 },
      { jobId: 'job-b', chapterFrom: 104 },
    ]);
    expect(a.map((x) => x.jobId)).toEqual(['job-a', 'job-b', 'job-c']);
    expect(a.map((x) => x.orderIndex)).toEqual([0, 1, 2]);

    const tie = assignWaveOrderIndices([
      { jobId: 'job-z', chapterFrom: 10 },
      { jobId: 'job-a', chapterFrom: 10 },
    ]);
    expect(tie.map((x) => x.jobId)).toEqual(['job-a', 'job-z']);
  });

  it('createTranslationWave freezes snapshot and stores order_index ASC', () => {
    const project = db.projects.create({ title: 'Wave Novel' });

    const mkJob = (from: number, to: number) =>
      db.jobs.create({
        project_id: project.id,
        type: 'translate_batch',
        state: 'QUEUED',
        priority: from,
        chapter_from: from,
        chapter_to: to,
        worker_mode: 'POOL',
        config: '{}',
      });

    const jC = mkJob(107, 109);
    const jA = mkJob(101, 103);
    const jB = mkJob(104, 106);

    const wave = createTranslationWave(db, {
      projectId: project.id,
      jobs: [
        { jobId: jC.id, chapterFrom: 107, chapterTo: 109 },
        { jobId: jA.id, chapterFrom: 101, chapterTo: 103 },
        { jobId: jB.id, chapterFrom: 104, chapterTo: 106 },
      ],
    });

    const ordered = db.translationWaves.listWaveJobsOrdered(wave.waveId);
    expect(ordered.map((r) => r.job_id)).toEqual([jA.id, jB.id, jC.id]);
    expect(ordered.map((r) => r.order_index)).toEqual([0, 1, 2]);
    expect(ordered.every((r) => r.snapshot_version === wave.knowledgeVersion)).toBe(true);
    expect(ordered.every((r) => r.commit_status === 'PENDING')).toBe(true);
  });

  it('commit barrier advances only in order_index — later provisional waits', async () => {
    const project = db.projects.create({ title: 'Wave Barrier' });
    setParallelWavesEnabled(db, true);

    const mkJob = (from: number, to: number) =>
      db.jobs.create({
        project_id: project.id,
        type: 'translate_batch',
        state: 'QUEUED',
        priority: from,
        chapter_from: from,
        chapter_to: to,
        worker_mode: 'POOL',
        config: '{}',
      });

    const jA = mkJob(101, 103);
    const jB = mkJob(104, 106);
    const wave = createTranslationWave(db, {
      projectId: project.id,
      jobs: [
        { jobId: jA.id, chapterFrom: 101, chapterTo: 103 },
        { jobId: jB.id, chapterFrom: 104, chapterTo: 106 },
      ],
    });

    // B finishes first — provisional only, cannot commit before A
    await storeWaveProvisional(db, jB.id, {
      parsed: emptyParsed({
        translations: [{ paragraphId: '[C000002:P000001]', text: 'B' }],
      }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 104,
      chapterTo: 106,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    let rows = db.translationWaves.listWaveJobsOrdered(wave.waveId);
    expect(rows[0].commit_status).toBe('PENDING');
    expect(rows[1].commit_status).toBe('PROVISIONAL');

    const mid = await tryAdvanceWaveCommit(db, wave.waveId);
    expect(mid.committed).toBe(0);
    expect(mid.blocked).toBe(true);

    // A finishes — commit A then B in order
    await storeWaveProvisional(db, jA.id, {
      parsed: emptyParsed({
        translations: [{ paragraphId: '[C000001:P000001]', text: 'A' }],
        termDeltas: [
          {
            action: 'discover',
            source: '张三',
            target: 'Trương Tam',
            category: 'name',
          },
        ],
      }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 101,
      chapterTo: 103,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    rows = db.translationWaves.listWaveJobsOrdered(wave.waveId);
    expect(rows[0].commit_status).toBe('COMMITTED');
    expect(rows[1].commit_status).toBe('COMMITTED');
    expect(db.translationWaves.getWaveById(wave.waveId)?.status).toBe('COMPLETED');
  });

  it('ConsistencyValidator: hard story-state → retranslate; soft name → repair', () => {
    const prior = emptyParsed({
      termDeltas: [
        { action: 'discover', source: '李四', target: 'Lý Tứ', category: 'name' },
      ],
      memoryDeltas: [
        {
          action: 'story_state',
          summaryText: 'Hero left the city',
          currentChapterNumber: 101,
        },
      ],
    });

    const soft = validateWaveConsistency({
      committed: [prior],
      candidate: emptyParsed({
        termDeltas: [
          { action: 'discover', source: '李四', target: 'Lý Tư', category: 'name' },
        ],
      }),
    });
    expect(soft.action).toBe('repair');
    expect(soft.conflicts[0]?.kind).toBe('name_correction');

    const repaired = stripConflictingDeltas(
      emptyParsed({
        termDeltas: [
          { action: 'discover', source: '李四', target: 'Lý Tư', category: 'name' },
          { action: 'discover', source: '剑', target: 'kiếm', category: 'item' },
        ],
      }),
      soft.conflicts,
    );
    expect(repaired.termDeltas).toHaveLength(1);
    expect(repaired.termDeltas[0]?.source).toBe('剑');

    const hard = validateWaveConsistency({
      committed: [prior],
      candidate: emptyParsed({
        memoryDeltas: [
          {
            action: 'story_state',
            summaryText: 'Hero never left the city',
            currentChapterNumber: 104,
          },
        ],
      }),
    });
    expect(hard.action).toBe('retranslate');
    expect(hard.conflicts[0]?.kind).toBe('story_state');
  });

  it('hard conflict at barrier requeues later job for retranslate', async () => {
    const project = db.projects.create({ title: 'Wave Retranslate' });

    const jA = db.jobs.create({
      project_id: project.id,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 101,
      chapter_from: 101,
      chapter_to: 103,
      worker_mode: 'POOL',
      config: '{}',
    });
    const jB = db.jobs.create({
      project_id: project.id,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 104,
      chapter_from: 104,
      chapter_to: 106,
      worker_mode: 'POOL',
      config: '{}',
    });

    const wave = createTranslationWave(db, {
      projectId: project.id,
      jobs: [
        { jobId: jA.id, chapterFrom: 101, chapterTo: 103 },
        { jobId: jB.id, chapterFrom: 104, chapterTo: 106 },
      ],
    });

    await storeWaveProvisional(db, jA.id, {
      parsed: emptyParsed({
        memoryDeltas: [
          {
            action: 'story_state',
            summaryText: 'A wins',
            currentChapterNumber: 101,
          },
        ],
      }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 101,
      chapterTo: 103,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    await storeWaveProvisional(db, jB.id, {
      parsed: emptyParsed({
        memoryDeltas: [
          {
            action: 'story_state',
            summaryText: 'A loses',
            currentChapterNumber: 104,
          },
        ],
      }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 104,
      chapterTo: 106,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    const rows = db.translationWaves.listWaveJobsOrdered(wave.waveId);
    expect(rows[0].commit_status).toBe('COMMITTED');
    expect(rows[1].commit_status).toBe('RETRANSLATE');
    expect(db.jobs.getById(jB.id)?.state).toBe('QUEUED');
  });
});
