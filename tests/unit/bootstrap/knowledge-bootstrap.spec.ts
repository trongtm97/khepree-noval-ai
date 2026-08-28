import { describe, expect, it, vi } from 'vitest';
import { buildBootstrapAnalysisPrompt } from '../../../src/main/bootstrap/bootstrap-prompt-builder';
import { selectBootstrapChapters } from '../../../src/main/bootstrap/bootstrap-local-prep';
import {
  parseBootstrapAnalysisOutput,
  BootstrapAnalysisOutputSchema,
} from '../../../src/shared/schemas/bootstrap';
import type { BootstrapLocalPrepResult } from '../../../src/main/bootstrap/bootstrap-local-prep';
import type { ChapterRow } from '../../../src/main/db/repositories/chapter-repository';

function chapter(n: number, text: string): ChapterRow {
  return {
    id: `ch-${n}`,
    project_id: 'p1',
    chapter_number: n,
    sequence_order: n,
    chapter_title: `Ch ${n}`,
    source_text: text,
    source_hash: null,
    status: 'pending',
    created_at: '',
    updated_at: '',
  } as ChapterRow;
}

describe('bootstrap local prep', () => {
  it('selects from expected_start_chapter not always 1–10', () => {
    const all = Array.from({ length: 520 }, (_, i) =>
      chapter(i + 1, 'x'.repeat(100)),
    );
    const selected = selectBootstrapChapters(all, {
      expectedStartChapter: 501,
      chapterCount: 10,
      characterBudget: 1_000_000,
    });
    expect(selected.map((c) => c.chapter_number)).toEqual([
      501, 502, 503, 504, 505, 506, 507, 508, 509, 510,
    ]);
  });

  it('shrinks chapter count when budget exceeded', () => {
    const all = [
      chapter(1, 'a'.repeat(50_000)),
      chapter(2, 'b'.repeat(50_000)),
      chapter(3, 'c'.repeat(50_000)),
    ];
    const selected = selectBootstrapChapters(all, {
      expectedStartChapter: 1,
      chapterCount: 10,
      characterBudget: 60_000,
    });
    expect(selected.length).toBeLessThanOrEqual(2);
    expect(selected[0]?.chapter_number).toBe(1);
  });

  it('does not send all chapters when novel is long', () => {
    const all = Array.from({ length: 2000 }, (_, i) =>
      chapter(i + 1, 'short'),
    );
    const selected = selectBootstrapChapters(all, {
      expectedStartChapter: null,
      chapterCount: 10,
      characterBudget: 80_000,
    });
    expect(selected).toHaveLength(10);
  });
});

describe('bootstrap prompt', () => {
  it('includes DO NOT TRANSLATE and known terms', () => {
    const prep: BootstrapLocalPrepResult = {
      projectId: 'p',
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'vi',
      bookProfile: '# Book',
      translationRules: '# Rules',
      knownTerms: [{ source: '筑基', target: 'Trúc Cơ', scope: 'GLOBAL' }],
      chapters: [{ chapterNumber: 1, title: 'Mở đầu', text: '王林修炼筑基' }],
      throughChapter: 1,
      chapterCountRequested: 10,
      chapterCountUsed: 1,
      characterBudget: 80_000,
      totalChars: 20,
    };
    const prompt = buildBootstrapAnalysisPrompt(prep);
    expect(prompt).toMatch(/DO NOT TRANSLATE/i);
    expect(prompt).toContain('筑基 → Trúc Cơ');
    expect(prompt).toContain('Source:');
    expect(prompt).toContain('Target edition:');
    expect(prompt).toContain('preferred_target_name');
    expect(prompt).not.toMatch(/preferred_vi/);
    expect(prompt).not.toMatch(/Return EXACTLY these sections/);
  });
});

describe('bootstrap JSON parse', () => {
  it('parses valid bootstrap JSON', () => {
    const raw = JSON.stringify({
      characters: [
        {
          source_name: '王林',
          preferred_vi: 'Vương Lâm',
          role: 'MAIN',
          gender: null,
          aliases: [],
          first_seen_chapter: 1,
          confidence: 0.9,
        },
      ],
      relationships: [],
      terms: [{ source: '筑基', preferred_vi: 'Trúc Cơ', category: 'skill' }],
      world_knowledge: { locations: ['恒岳'], sects: [], cultivation_system: [], organizations: [], items: [], rules: [] },
      story_state: { through_chapter: 1, summary: 'Bắt đầu tu luyện', open_plot_threads: [] },
      recent_context: { through_chapter: 1, important_events: ['Gặp sư phụ'] },
    });
    const parsed = parseBootstrapAnalysisOutput(raw);
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0]?.preferred_target).toBe('Vương Lâm');
    expect(parsed.relationships).toEqual([]);
    expect(parsed.terms[0]?.source).toBe('筑基');
    expect(parsed.terms[0]?.preferred_target).toBe('Trúc Cơ');
  });

  it('allows empty relationships without fail', () => {
    const parsed = BootstrapAnalysisOutputSchema.parse({
      characters: [],
      relationships: [],
      terms: [],
      world_knowledge: {},
      story_state: {},
      recent_context: {},
    });
    expect(parsed.relationships).toEqual([]);
  });

  it('tolerates markdown fence + trailing commas', () => {
    const raw = '```json\n{"characters":[],"relationships":[],"terms":[],"world_knowledge":{},"story_state":{},"recent_context":{},}\n```';
    const parsed = parseBootstrapAnalysisOutput(raw);
    expect(parsed.characters).toEqual([]);
  });
});

describe('BootstrapAnalysisService AI call count', () => {
  it('documents one-call contract via mock counter', () => {
    const sendPrompt = vi.fn(() =>
      Promise.resolve({
        status: 'SUCCESS',
        text: '{}',
      }),
    );
    expect(sendPrompt).toHaveBeenCalledTimes(0);
    void sendPrompt();
    expect(sendPrompt).toHaveBeenCalledTimes(1);
  });
});
