import { describe, it, expect, vi } from 'vitest';
import { JobService } from '@main/services/job-service';
import type { DatabaseManager } from '@main/db/database-manager';
import type { JobRow } from '@main/db/repositories/job-repository';

type ChapterSeed = {
  id: string;
  chapter_number: number;
  sequence_order: number;
  source_status: string;
};

type ParaSeed = {
  id: string;
  paragraph_id: string;
  source_text: string;
  translated?: string;
  human_locked?: boolean;
};

function mockNovelDb(opts: {
  projectId: string;
  chapters: ChapterSeed[];
  paragraphsByChapter: Record<string, ParaSeed[]>;
}): { db: DatabaseManager; created: JobRow[] } {
  const created: JobRow[] = [];
  const byId = new Map<string, JobRow>();

  const db = {
    projects: {
      getById: (id: string) => (id === opts.projectId ? { id } : null),
    },
    chapters: {
      listByProject: (projectId: string) =>
        projectId === opts.projectId ? opts.chapters : [],
    },
    paragraphs: {
      listByChapter: (chapterId: string) => opts.paragraphsByChapter[chapterId] ?? [],
    },
    translations: {
      getByParagraphId: (paraUuid: string) => {
        for (const paras of Object.values(opts.paragraphsByChapter)) {
          const p = paras.find((x) => x.id === paraUuid);
          if (!p) continue;
          if (p.translated == null) return null;
          return {
            id: `t-${paraUuid}`,
            translated_text: p.translated,
            human_locked: p.human_locked ? 1 : 0,
            status: 'translated',
          };
        }
        return null;
      },
    },
    workerStates: {
      listAll: () => [],
      listEnabled: () => [],
    },
    googleAccounts: {
      getById: () => null,
    },
    aiProviders: {
      listEnabledOrdered: () => [{ id: 'prov-web', type: 'GEMINI_WEB_API' }],
    },
    batchSize: {
      getProjectStats: () => null,
      insertDecision: (input: Record<string, unknown>) => ({
        id: `dec-${created.length + 1}`,
        ...input,
      }),
      linkDecisionToJob: () => undefined,
    },
    jobs: {
      getById: (id: string) => byId.get(id) ?? null,
      create: (input: {
        project_id: string;
        type: string;
        state: string;
        priority: number;
        chapter_from: number;
        chapter_to: number;
        worker_mode: string;
        pinned_account_id: string | null;
        config: string;
      }) => {
        const row: JobRow = {
          id: `job-${created.length + 1}`,
          project_id: input.project_id,
          type: input.type,
          state: input.state,
          worker_id: null,
          priority: input.priority,
          chapter_from: input.chapter_from,
          chapter_to: input.chapter_to,
          worker_mode: input.worker_mode,
          pinned_account_id: input.pinned_account_id,
          attempt_count: 0,
          error: null,
          paused_reason: null,
          progress: null,
          config: input.config,
          lease_owner: null,
          lease_expires_at: null,
          scheduled_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          started_at: null,
          completed_at: null,
        };
        created.push(row);
        byId.set(row.id, row);
        return row;
      },
    },
  } as unknown as DatabaseManager;

  return { db, created };
}

describe('JobService.enqueueTranslateNovel', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';

  function seed() {
    return mockNovelDb({
      projectId,
      chapters: [
        {
          id: 'ch1',
          chapter_number: 1,
          sequence_order: 1,
          source_status: 'SOURCE_READY',
        },
        {
          id: 'ch2',
          chapter_number: 2,
          sequence_order: 2,
          source_status: 'SOURCE_READY',
        },
        {
          id: 'ch3',
          chapter_number: 3,
          sequence_order: 3,
          source_status: 'SOURCE_READY',
        },
        {
          id: 'ch4',
          chapter_number: 4,
          sequence_order: 4,
          source_status: 'SOURCE_READY',
        },
        {
          id: 'ch5',
          chapter_number: 5,
          sequence_order: 5,
          source_status: 'NO_SOURCE',
        },
      ],
      paragraphsByChapter: {
        ch1: [
          {
            id: 'p1',
            paragraph_id: '[C000001:P000001]',
            source_text: '一。',
            translated: 'Một.',
          },
        ],
        ch2: [{ id: 'p2', paragraph_id: '[C000002:P000001]', source_text: '二。' }],
        ch3: [
          {
            id: 'p3a',
            paragraph_id: '[C000003:P000001]',
            source_text: '三甲。',
            translated: 'Ba A.',
          },
          { id: 'p3b', paragraph_id: '[C000003:P000002]', source_text: '三乙。' },
        ],
        ch4: [{ id: 'p4', paragraph_id: '[C000004:P000001]', source_text: '四。' }],
        ch5: [{ id: 'p5', paragraph_id: '[C000005:P000001]', source_text: '五。' }],
      },
    });
  }

  it('batches up to maxChaptersPerJob untranslated chapters into one job', async () => {
    const { db, created } = seed();
    const service = new JobService(db);
    const result = service.enqueueTranslateNovel({ projectId, skipTranslated: true });

    await vi.waitFor(() => expect(created.length).toBe(1));

    expect(result.queuedCount).toBe(1);
    expect(result.jobs[0]?.chapterFrom).toBe(2);
    expect(result.jobs[0]?.chapterTo).toBe(4);
    expect(result.skippedCount).toBe(1);

    const config = JSON.parse(created[0]?.config ?? '{}') as {
      sourceParagraphIds: string[];
      chapterIds?: string[];
    };
    expect(config.sourceParagraphIds).toEqual([
      '[C000002:P000001]',
      '[C000003:P000002]',
      '[C000004:P000001]',
    ]);
    expect(config.chapterIds).toEqual(['ch2', 'ch3', 'ch4']);
  });

  it('respects chapterFrom/chapterTo range', () => {
    const { db } = seed();
    const service = new JobService(db);
    const result = service.enqueueTranslateNovel({
      projectId,
      chapterFrom: 3,
      chapterTo: 4,
      skipTranslated: true,
    });

    expect(result.queuedCount).toBe(1);
    expect(result.jobs[0]?.chapterFrom).toBe(3);
    expect(result.jobs[0]?.chapterTo).toBe(4);
  });

  it('sets priority from first chapter in batch', () => {
    const { db } = seed();
    const service = new JobService(db);
    const result = service.enqueueTranslateNovel({ projectId, skipTranslated: true });
    expect(result.jobs.map((j) => j.priority)).toEqual([2]);
  });

  it('returns empty when everything already translated in range', () => {
    const { db } = seed();
    const service = new JobService(db);
    const result = service.enqueueTranslateNovel({
      projectId,
      chapterFrom: 1,
      chapterTo: 1,
      skipTranslated: true,
    });
    expect(result.queuedCount).toBe(0);
    expect(result.jobs).toEqual([]);
  });

  it('queues only chapters listed in chapterIds', () => {
    const { db } = seed();
    const service = new JobService(db);
    const result = service.enqueueTranslateNovel({
      projectId,
      chapterIds: ['ch2', 'ch4'],
      skipTranslated: true,
    });
    expect(result.queuedCount).toBe(1);
    expect(result.jobs[0]?.chapterFrom).toBe(2);
    expect(result.jobs[0]?.chapterTo).toBe(4);
  });

  it('skips translated chapter even when listed in chapterIds', () => {
    const { db } = seed();
    const service = new JobService(db);
    const result = service.enqueueTranslateNovel({
      projectId,
      chapterIds: ['ch1', 'ch2'],
      skipTranslated: true,
    });
    expect(result.queuedCount).toBe(1);
    expect(result.jobs[0]?.chapterFrom).toBe(2);
    expect(result.skippedCount).toBe(1);
  });
});
