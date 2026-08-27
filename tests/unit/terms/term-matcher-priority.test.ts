import { describe, expect, it } from 'vitest';
import type { TermRow } from '@main/db/repositories/term-repository';
import {
  buildTermMatchIndex,
  matchKnownTermsInText,
  resolveTermConflict,
  termEffectivePriority,
} from '@main/terms/term-matcher';

function makeTerm(partial: Partial<TermRow> & Pick<TermRow, 'source_simplified' | 'scope'>): TermRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    source_simplified: partial.source_simplified,
    source_traditional: partial.source_traditional ?? null,
    pinyin: partial.pinyin ?? null,
    term_type: partial.term_type ?? 'GENERAL',
    genre: partial.genre ?? null,
    scope: partial.scope,
    scope_ref: partial.scope_ref ?? null,
    status: partial.status ?? 'PROJECT_VERIFIED',
    confidence: partial.confidence ?? null,
    occurrence_count: partial.occurrence_count ?? 0,
    novel_count: partial.novel_count ?? 0,
    project_count: partial.project_count ?? 0,
    locked: partial.locked ?? 0,
    meaning: partial.meaning ?? null,
    notes: partial.notes ?? null,
    human_confirm_count: partial.human_confirm_count ?? 0,
    first_seen_chapter: partial.first_seen_chapter ?? null,
    discovered_from_chapter: partial.discovered_from_chapter ?? null,
    future_sensitive: partial.future_sensitive ?? 0,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
    deleted_at: partial.deleted_at ?? null,
  };
}

describe('termEffectivePriority', () => {
  it('ranks PROJECT locked above all other scopes', () => {
    const projectLocked = makeTerm({
      source_simplified: '青云门',
      scope: 'PROJECT',
      scope_ref: 'p1',
      locked: 1,
    });
    const global = makeTerm({ source_simplified: '青云门', scope: 'GLOBAL' });
    const context = makeTerm({ source_simplified: '青云门', scope: 'CONTEXT' });
    const user = makeTerm({ source_simplified: '青云门', scope: 'USER' });
    const genre = makeTerm({ source_simplified: '青云门', scope: 'GENRE', genre: 'xianxia' });

    expect(termEffectivePriority(projectLocked)).toBeGreaterThan(termEffectivePriority(global));
    expect(termEffectivePriority(projectLocked)).toBeGreaterThan(termEffectivePriority(context));
    expect(termEffectivePriority(projectLocked)).toBeGreaterThan(termEffectivePriority(user));
    expect(termEffectivePriority(projectLocked)).toBeGreaterThan(termEffectivePriority(genre));
  });

  it('orders non-locked scopes: CONTEXT > USER > GENRE > GLOBAL', () => {
    const global = makeTerm({ source_simplified: '灵气', scope: 'GLOBAL' });
    const genre = makeTerm({ source_simplified: '灵气', scope: 'GENRE' });
    const user = makeTerm({ source_simplified: '灵气', scope: 'USER' });
    const context = makeTerm({ source_simplified: '灵气', scope: 'CONTEXT' });

    expect(termEffectivePriority(context)).toBeGreaterThan(termEffectivePriority(user));
    expect(termEffectivePriority(user)).toBeGreaterThan(termEffectivePriority(genre));
    expect(termEffectivePriority(genre)).toBeGreaterThan(termEffectivePriority(global));
  });
});

describe('resolveTermConflict', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';

  it('never lets GLOBAL override PROJECT locked for same source', () => {
    const projectLocked = makeTerm({
      id: 'proj-locked',
      source_simplified: '李逍遥',
      scope: 'PROJECT',
      scope_ref: projectId,
      locked: 1,
    });
    const global = makeTerm({
      id: 'global',
      source_simplified: '李逍遥',
      scope: 'GLOBAL',
    });

    const resolved = resolveTermConflict([global, projectLocked], { projectId });
    expect(resolved?.id).toBe('proj-locked');
  });

  it('prefers CONTEXT over GLOBAL when both match', () => {
    const global = makeTerm({
      id: 'g',
      source_simplified: '筑基',
      scope: 'GLOBAL',
    });
    const context = makeTerm({
      id: 'c',
      source_simplified: '筑基',
      scope: 'CONTEXT',
    });

    const resolved = resolveTermConflict([global, context], { projectId });
    expect(resolved?.id).toBe('c');
  });

  it('prefers USER over GENRE over GLOBAL', () => {
    const global = makeTerm({ id: 'g', source_simplified: '金丹', scope: 'GLOBAL' });
    const genre = makeTerm({
      id: 'ge',
      source_simplified: '金丹',
      scope: 'GENRE',
      genre: 'xianxia',
    });
    const user = makeTerm({ id: 'u', source_simplified: '金丹', scope: 'USER', scope_ref: 'user-1' });

    expect(resolveTermConflict([global, genre, user], { userId: 'user-1' })?.id).toBe('u');
    expect(resolveTermConflict([global, genre], { genre: 'xianxia' })?.id).toBe('ge');
    expect(resolveTermConflict([global], {})?.id).toBe('g');
  });

  it('PROJECT without lock still beats CONTEXT (project-specific)', () => {
    const project = makeTerm({
      id: 'p',
      source_simplified: '仙剑',
      scope: 'PROJECT',
      scope_ref: projectId,
      locked: 0,
    });
    const context = makeTerm({ id: 'c', source_simplified: '仙剑', scope: 'CONTEXT' });

    const resolved = resolveTermConflict([project, context], { projectId });
    expect(resolved?.id).toBe('p');
  });

  it('filters PROJECT term from wrong project', () => {
    const otherProject = makeTerm({
      id: 'other',
      source_simplified: '赵灵儿',
      scope: 'PROJECT',
      scope_ref: 'other-project',
      locked: 1,
    });
    const global = makeTerm({ id: 'g', source_simplified: '赵灵儿', scope: 'GLOBAL' });

    const resolved = resolveTermConflict([otherProject, global], { projectId });
    expect(resolved?.id).toBe('g');
  });

  it('returns null for empty candidate list', () => {
    expect(resolveTermConflict([], { projectId })).toBeNull();
  });
});

describe('matchKnownTermsInText', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';

  it('uses PROJECT locked translation in chapter scan', () => {
    const terms = [
      makeTerm({
        id: 'pl',
        source_simplified: '青云门',
        scope: 'PROJECT',
        scope_ref: projectId,
        locked: 1,
      }),
      makeTerm({
        id: 'gl',
        source_simplified: '青云门',
        scope: 'GLOBAL',
      }),
    ];
    const text = '他加入了青云门修炼。';
    const index = buildTermMatchIndex(terms);
    const matches = matchKnownTermsInText(text, index, terms, { projectId });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.term.id).toBe('pl');
    expect(matches[0]?.effectivePriority).toBeGreaterThan(1000);
  });

  it('finds multiple distinct terms in one chapter', () => {
    const terms = [
      makeTerm({ id: 'a', source_simplified: '灵气', scope: 'GLOBAL' }),
      makeTerm({ id: 'b', source_simplified: '筑基', scope: 'GLOBAL' }),
    ];
    const text = '吸收灵气后突破筑基。';
    const index = buildTermMatchIndex(terms);
    const matches = matchKnownTermsInText(text, index, terms, {});

    expect(matches.map((m) => m.sourceText).sort()).toEqual(['灵气', '筑基']);
  });

  it('prefers longest match when overlapping (via covered buffer)', () => {
    const terms = [
      makeTerm({ id: 'short', source_simplified: '青云', scope: 'GLOBAL' }),
      makeTerm({ id: 'long', source_simplified: '青云门', scope: 'GLOBAL' }),
    ];
    const text = '青云门弟子';
    const index = buildTermMatchIndex(terms);
    const matches = matchKnownTermsInText(text, index, terms, {});

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sourceText).toBe('青云门');
  });
});

describe('buildTermMatchIndex', () => {
  it('keeps highest-priority term per source in bySource map', () => {
    const terms = [
      makeTerm({ id: 'g', source_simplified: '测试', scope: 'GLOBAL' }),
      makeTerm({ id: 'c', source_simplified: '测试', scope: 'CONTEXT' }),
    ];
    const index = buildTermMatchIndex(terms);
    expect(index.bySource.get('测试')?.scope).toBe('CONTEXT');
  });
});
