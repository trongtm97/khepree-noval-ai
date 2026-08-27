import { describe, expect, it } from 'vitest';
import { buildMemoryContext } from '../../../src/main/memory/context-selector';
import type { DatabaseManager } from '../../../src/main/db/database-manager';
import type { CharacterRow } from '../../../src/main/db/repositories/character-repository';
import type { RelationshipRow } from '../../../src/main/db/repositories/relationship-repository';

function mockDb(opts: {
  characters: CharacterRow[];
  relationships: RelationshipRow[];
  events: {
    category: string;
    event_key: string;
    event_value: string | null;
    chapter_number: number | null;
  }[];
  storyChapter: number | null;
}): DatabaseManager {
  return {
    paragraphs: {
      listByChapter: () => [{ source_text: '王林看见李慕婉' }],
    },
    chapters: {
      getById: () => ({ chapter_number: 1, sequence_order: 1 }),
    },
    characters: {
      listByProject: () => opts.characters,
      listAliases: () => [],
    },
    relationships: {
      listActiveAtChapter: (_pid: string, chapter: number) =>
        opts.relationships.filter(
          (r) =>
            (r.valid_from_chapter == null || r.valid_from_chapter <= chapter) &&
            (r.valid_to_chapter == null || r.valid_to_chapter >= chapter),
        ),
    },
    memoryEvents: {
      listByProject: () =>
        opts.events.map((e) => ({
          ...e,
          id: 'e',
          project_id: 'p',
          source: 'ai_delta',
          locked: 0,
          created_at: '',
          updated_at: '',
        })),
      listRecentChapters: () =>
        opts.events.map((e) => ({
          ...e,
          id: 'e',
          project_id: 'p',
          source: 'ai_delta',
          locked: 0,
          created_at: '',
          updated_at: '',
        })),
    },
    terms: {
      listForMatching: () => [],
      listTranslations: () => [],
    },
    termCandidates: {
      listPendingForPack: () => [],
    },
    storyStates: {
      getByProject: () =>
        opts.storyChapter == null
          ? null
          : {
              id: 's',
              project_id: 'p',
              current_chapter_number: opts.storyChapter,
              locked: 0,
              summary_text: `State at ${opts.storyChapter}`,
              cultivation_state: null,
              location_state: null,
              important_items: null,
              unresolved_plot_points: JSON.stringify(['A is father of B']),
              world_knowledge_json: null,
              state_json: null,
              created_at: '',
              updated_at: '',
            },
      parseStructured: (row: { current_chapter_number: number | null; summary_text: string | null; unresolved_plot_points: string | null }) => ({
        currentChapterNumber: row.current_chapter_number,
        summaryText: row.summary_text,
        unresolvedPlotPoints: row.unresolved_plot_points
          ? (JSON.parse(row.unresolved_plot_points) as string[])
          : [],
      }),
    },
    getConnection: () => ({
      prepare: () => ({ get: () => null }),
    }),
  } as unknown as DatabaseManager;
}

describe('context selector temporal / future leakage', () => {
  it('excludes characters first seen after anchor chapter', () => {
    const db = mockDb({
      characters: [
        {
          id: 'c1',
          project_id: 'p',
          canonical_name: '王林',
          translated_name: 'Vương Lâm',
          gender: null,
          role: 'MAIN',
          description: null,
          first_appearance_paragraph_id: null,
          metadata: null,
          status: 'active',
          first_chapter: 1,
          last_chapter: 10,
          discovered_from_chapter: 1,
          future_sensitive: 0,
          locked: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'c2',
          project_id: 'p',
          canonical_name: '李慕婉',
          translated_name: 'Lý Mộ Uyển',
          gender: null,
          role: null,
          description: null,
          first_appearance_paragraph_id: null,
          metadata: null,
          status: 'active',
          first_chapter: 8,
          last_chapter: 10,
          discovered_from_chapter: 8,
          future_sensitive: 0,
          locked: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      relationships: [
        {
          id: 'r1',
          project_id: 'p',
          from_character_id: 'c1',
          to_character_id: 'c2',
          relationship_type: 'father',
          description: 'A is father of B',
          since_paragraph_id: null,
          a_calls_b: null,
          b_calls_a: null,
          valid_from_chapter: 8,
          valid_to_chapter: null,
          confidence: 1,
          source: 'ai',
          locked: 0,
          future_sensitive: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      events: [],
      storyChapter: 10,
    });

    const ctx = buildMemoryContext(
      db,
      { projectId: 'p', chapterIds: ['ch1'] },
      (id) =>
        id === 'c1'
          ? {
              id: 'c1',
              projectId: 'p',
              canonicalName: '王林',
              translatedName: 'Vương Lâm',
              gender: null,
              role: 'MAIN',
              description: null,
              status: 'active',
              firstChapter: 1,
              lastChapter: 10,
              locked: false,
              aliases: [],
              createdAt: '',
              updatedAt: '',
            }
          : id === 'c2'
            ? {
                id: 'c2',
                projectId: 'p',
                canonicalName: '李慕婉',
                translatedName: 'Lý Mộ Uyển',
                gender: null,
                role: null,
                description: null,
                status: 'active',
                firstChapter: 8,
                lastChapter: 10,
                locked: false,
                aliases: [],
                createdAt: '',
                updatedAt: '',
              }
            : null,
      (row) => ({
        id: row.id,
        projectId: row.project_id,
        fromCharacterId: row.from_character_id,
        toCharacterId: row.to_character_id,
        fromName: '王林',
        toName: '李慕婉',
        relationshipType: row.relationship_type,
        description: row.description,
        aCallsB: row.a_calls_b,
        bCallsA: row.b_calls_a,
        validFromChapter: row.valid_from_chapter,
        validToChapter: row.valid_to_chapter,
        confidence: row.confidence,
        source: row.source,
        locked: row.locked === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );

    expect(ctx.activeCharacters.map((c) => c.canonicalName)).toEqual(['王林']);
    expect(ctx.relationships).toHaveLength(0);
    expect(ctx.storyState?.summaryText).toBeNull();
  });
});
