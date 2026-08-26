import { describe, it, expect, vi } from 'vitest';
import { TranslationEditorService } from '@main/services/translation-editor-service';
import type { DatabaseManager } from '@main/db/database-manager';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const CH1 = '22222222-2222-2222-2222-222222222221';
const CH2 = '22222222-2222-2222-2222-222222222222';

function mockEditorDb(): {
  db: DatabaseManager;
  cleared: string[];
  paragraphsByChapter: Record<string, { paragraph_id: string; source_text: string }[]>;
} {
  const cleared: string[] = [];
  const paragraphsByChapter: Record<
    string,
    { id: string; paragraph_id: string; source_text: string }[]
  > = {
    [CH1]: [{ id: 'p1', paragraph_id: '[C000001:P000001]', source_text: '一。' }],
    [CH2]: [
      { id: 'p2a', paragraph_id: '[C000002:P000001]', source_text: '二甲。' },
      { id: 'p2b', paragraph_id: '[C000002:P000002]', source_text: '二乙。' },
    ],
  };
  const chapters: Record<
    string,
    { id: string; project_id: string; chapter_number: number; sequence_order: number }
  > = {
    [CH1]: { id: CH1, project_id: PROJECT, chapter_number: 1, sequence_order: 1 },
    [CH2]: { id: CH2, project_id: PROJECT, chapter_number: 2, sequence_order: 2 },
  };

  const db = {
    chapters: {
      getById: (id: string) => chapters[id] ?? null,
    },
    paragraphs: {
      listByChapter: (chapterId: string) => paragraphsByChapter[chapterId] ?? [],
    },
    translations: {
      clearAiByChapter: (chapterId: string) => {
        cleared.push(chapterId);
        return { deleted: chapterId === CH1 ? 1 : 2, keptLocked: chapterId === CH2 ? 1 : 0 };
      },
      getByParagraphId: () => null,
    },
    terms: {
      listForMatching: () => [],
      getPrimaryTranslation: () => null,
    },
    projects: {
      getById: () => ({ id: PROJECT, genre: null }),
    },
    jobs: {
      listByProject: () => [],
    },
  } as unknown as DatabaseManager;

  return { db, cleared, paragraphsByChapter };
}

describe('TranslationEditorService multi-chapter', () => {
  it('clearChaptersTranslations aggregates deleted/kept across chapters', () => {
    const { db, cleared } = mockEditorDb();
    const service = new TranslationEditorService(db);
    const result = service.clearChaptersTranslations(PROJECT, [CH1, CH2]);

    expect(cleared).toEqual([CH1, CH2]);
    expect(result.deleted).toBe(3);
    expect(result.keptLocked).toBe(1);
    expect(result.chapterIds).toEqual([CH1, CH2]);
  });

  it('retranslateChapters clears then enqueues one job per chapter with paragraphs', () => {
    const { db, cleared } = mockEditorDb();
    const service = new TranslationEditorService(db);
    const enqueue = vi.fn((input: { chapterFrom: number; sourceParagraphIds: string[] }) => ({
      job: { id: `job-${input.chapterFrom}`, state: 'QUEUED' },
    }));

    const result = service.retranslateChapters(PROJECT, [CH1, CH2], enqueue);

    expect(cleared).toEqual([CH1, CH2]);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0]![0].sourceParagraphIds).toEqual(['[C000001:P000001]']);
    expect(enqueue.mock.calls[1]![0].sourceParagraphIds).toEqual([
      '[C000002:P000001]',
      '[C000002:P000002]',
    ]);
    expect(result.jobs).toEqual([
      { id: 'job-1', state: 'QUEUED', chapterId: CH1 },
      { id: 'job-2', state: 'QUEUED', chapterId: CH2 },
    ]);
    expect(result.deleted).toBe(3);
  });

  it('clearChaptersTranslations rejects foreign chapter', () => {
    const { db } = mockEditorDb();
    const service = new TranslationEditorService(db);
    expect(() =>
      service.clearChaptersTranslations(PROJECT, ['33333333-3333-3333-3333-333333333333']),
    ).toThrow(/not found/i);
  });
});
