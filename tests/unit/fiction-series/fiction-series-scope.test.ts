import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';
import { buildTermMatchIndex, matchKnownTermsInText } from '@main/terms/term-matcher';
import { NotebookKnowledgeBuilder } from '@main/notebook/knowledge-builder';

describe('fiction series scoped knowledge', () => {
  let tempRoot: string;
  let service: FictionSeriesService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-series-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetFictionSeriesServiceForTests();
    service = new FictionSeriesService(() => getDatabase());
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function createProject(title: string): string {
    return getDatabase().projects.create({ title }).id;
  }

  function createSeriesTerm(seriesId: string, source: string, translation: string) {
    const db = getDatabase();
    return db.terms.create({
      source_text: source,
      scope: 'SERIES',
      scope_ref: seriesId,
      status: 'PROJECT_VERIFIED',
      preferred_translation: translation,
    });
  }

  it('isolates same character name across two series', () => {
    const db = getDatabase();
    const seriesA = service.createSeries({ title: 'Series A' });
    const seriesB = service.createSeries({ title: 'Series B' });
    const projectA = createProject('Vol A');
    const projectB = createProject('Vol B');
    service.assignProjectToSeries({ projectId: projectA, seriesId: seriesA.id, force: true });
    service.assignProjectToSeries({ projectId: projectB, seriesId: seriesB.id, force: true });

    createSeriesTerm(seriesA.id, '李逍遥', 'Lý Tiêu Dao');
    createSeriesTerm(seriesB.id, '李逍遥', 'Lee Xiaoyao');

    const rowsA = db.terms.listForMatching({ projectId: projectA, seriesId: seriesA.id });
    const rowsB = db.terms.listForMatching({ projectId: projectB, seriesId: seriesB.id });

    const matchA = matchKnownTermsInText(
      '李逍遥出手',
      buildTermMatchIndex(rowsA),
      rowsA,
      { projectId: projectA, seriesId: seriesA.id },
    );
    const matchB = matchKnownTermsInText(
      '李逍遥出手',
      buildTermMatchIndex(rowsB),
      rowsB,
      { projectId: projectB, seriesId: seriesB.id },
    );

    const transA = db.terms.listTranslations(matchA[0]!.term.id)[0]?.target_text;
    const transB = db.terms.listTranslations(matchB[0]!.term.id)[0]?.target_text;
    expect(transA).toBe('Lý Tiêu Dao');
    expect(transB).toBe('Lee Xiaoyao');
  });

  it('project override beats series term', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'One' });
    const projectId = createProject('Override vol');
    service.assignProjectToSeries({ projectId, seriesId: series.id, force: true });

    createSeriesTerm(series.id, '王林', 'Vương Lâm');
    db.terms.create({
      source_text: '王林',
      scope: 'PROJECT',
      scope_ref: projectId,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Vuong Lam',
    });

    const rows = db.terms.listForMatching({ projectId, seriesId: series.id });
    const matches = matchKnownTermsInText(
      '王林修炼',
      buildTermMatchIndex(rows),
      rows,
      { projectId, seriesId: series.id },
    );
    const trans = db.terms.listTranslations(matches[0]!.term.id)[0]?.target_text;
    expect(trans).toBe('Vuong Lam');
    expect(matches[0]!.term.scope).toBe('PROJECT');
  });

  it('human-locked project term wins series', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Lock test' });
    const projectId = createProject('Lock vol');
    service.assignProjectToSeries({ projectId, seriesId: series.id, force: true });

    createSeriesTerm(series.id, '韩立', 'Hàn Lập');
    db.terms.create({
      source_text: '韩立',
      scope: 'PROJECT',
      scope_ref: projectId,
      status: 'LOCKED',
      locked: true,
      preferred_translation: 'Han Li',
    });

    const rows = db.terms.listForMatching({ projectId, seriesId: series.id });
    const matches = matchKnownTermsInText(
      '韩立',
      buildTermMatchIndex(rows),
      rows,
      { projectId, seriesId: series.id },
    );
    expect(db.terms.listTranslations(matches[0]!.term.id)[0]?.target_text).toBe('Han Li');
  });

  it('removing membership does not delete project data', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Detach' });
    const projectId = createProject('Keep data');
    service.assignProjectToSeries({ projectId, seriesId: series.id, force: true });
    db.terms.create({
      source_text: '测试',
      scope: 'PROJECT',
      scope_ref: projectId,
      preferred_translation: 'test',
    });

    service.removeVolume(series.id, projectId);
    expect(db.projects.getById(projectId)).not.toBeNull();
    expect(db.terms.listByScope('PROJECT', projectId).length).toBe(1);
    expect(db.fictionSeries.getVolumeByProject(projectId)).toBeNull();
  });

  it('knowledge rebuild is deterministic', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Rebuild' });
    const projectId = createProject('Rebuild vol');
    service.assignProjectToSeries({ projectId, seriesId: series.id, force: true });
    createSeriesTerm(series.id, '术语', 'thuật ngữ');
    db.terms.create({
      source_text: '本地',
      scope: 'PROJECT',
      scope_ref: projectId,
      preferred_translation: 'local',
    });

    const builder = new NotebookKnowledgeBuilder(db);
    const a = builder.buildProjectTerms(projectId);
    const b = builder.buildProjectTerms(projectId);
    expect(a).toBe(b);
    expect(a).toContain('thuật ngữ');
    expect(a).toContain('local');
  });

  it('assign seeds SERIES glossary and world from project', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Seed' });
    const projectId = createProject('Seed vol');
    db.terms.create({
      source_text: '共享词',
      scope: 'PROJECT',
      scope_ref: projectId,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'shared term',
    });
    db.storyStates.patch(projectId, {
      worldKnowledge: { realm: 'Qi cultivation' },
    });

    service.assignProjectToSeries({ projectId, seriesId: series.id, force: true });

    const seriesTerms = db.terms.listByScope('SERIES', series.id);
    expect(seriesTerms.some((t) => t.source_text === '共享词')).toBe(true);
    expect(db.terms.listByScope('PROJECT', projectId).length).toBe(1);

    const world = db.fictionSeries.getWorldState(series.id);
    expect(world?.world_knowledge_json).toContain('Qi cultivation');
  });

  it('project DTO exposes series membership', async () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'DTO Series' });
    const projectId = createProject('DTO vol');
    service.assignProjectToSeries({ projectId, seriesId: series.id, force: true });
    const { toProjectDtoFromDb } = await import('@main/services/project-dto');
    const row = db.projects.getById(projectId)!;
    const dto = toProjectDtoFromDb(db, row);
    expect(dto.seriesId).toBe(series.id);
    expect(dto.seriesTitle).toBe('DTO Series');
  });

  it('translation memory context consumes series glossary, style, world, prior-volume characters', async () => {
    const db = getDatabase();
    const { ensureDefaultEdition } = await import('@main/services/edition-service');
    const { buildMemoryContext } = await import('@main/memory/context-selector');
    const { buildTranslationPack } = await import('@main/prompt/translation-pack-builder');
    const { toCharacterDto, toRelationshipDto } = await import('@main/services/memory-dto');
    const { resolveCharacterPreferredName } = await import('@main/memory/edition-memory');

    const series = service.createSeries({ title: 'Ctx Series' });
    const vol1 = createProject('Vol 1');
    const vol2 = createProject('Vol 2');
    const edition2 = ensureDefaultEdition(db, vol2).id;

    db.fictionSeries.upsertStyleRule({
      seriesId: series.id,
      ruleKind: 'naming',
      content: 'Keep sect titles untranslated on first mention',
      sortOrder: 0,
    });
    db.fictionSeries.upsertStyleRule({
      seriesId: series.id,
      ruleKind: 'address',
      content: 'Junior disciples address elders as sư phụ',
      sortOrder: 1,
    });
    db.fictionSeries.setWorldKnowledgeJson(
      series.id,
      JSON.stringify({ 青云门: 'Thanh Vân Môn — major righteous sect' }),
    );
    db.terms.create({
      source_text: '筑基',
      scope: 'SERIES',
      scope_ref: series.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Trúc Cơ',
      term_type: 'CULTIVATION_LEVEL',
    });

    const heroVol1 = db.characters.create({
      project_id: vol1,
      canonical_name: '张小凡',
      translated_name: 'Trương Tiểu Phàm',
      first_chapter: 1,
    });
    db.characters.addAlias(heroVol1.id, '小凡');

    service.assignProjectToSeries({ projectId: vol1, seriesId: series.id, force: true });
    service.assignProjectToSeries({ projectId: vol2, seriesId: series.id, force: true });

    const chapter = db.chapters.create({
      project_id: vol2,
      chapter_number: 1,
      sequence_order: 1,
      display_title: 'Ch 1',
      chapter_type: 'NORMAL',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: 'P1-001',
      sequence: 0,
      source_text: '张小凡在青云门修炼筑基。',
    });

    const ctx = buildMemoryContext(
      db,
      { projectId: vol2, chapterIds: [chapter.id], editionId: edition2 },
      (id) => {
        const row = db.characters.getById(id);
        if (!row) return null;
        return toCharacterDto(
          row,
          db.characters.listAliases(row.id).map((a) => a.alias),
          resolveCharacterPreferredName(db, row, edition2),
        );
      },
      (rel) => {
        const from = db.characters.getById(rel.from_character_id);
        const to = db.characters.getById(rel.to_character_id);
        return toRelationshipDto(rel, from?.canonical_name ?? '?', to?.canonical_name ?? '?');
      },
    );

    expect(ctx.criticalProjectRules.some((r) => r.includes('[series:naming]'))).toBe(true);
    expect(ctx.criticalProjectRules.some((r) => r.includes('[series:address]'))).toBe(true);
    expect(ctx.worldKnowledge.some((w) => w.key === 'series:青云门')).toBe(true);
    expect(ctx.activeTerms.some((t) => t.sourceText === '筑基')).toBe(true);
    expect(ctx.activeCharacters.some((c) => c.canonicalName === '张小凡')).toBe(true);
    // Fingerprint must change when series knowledge is in the pack (hash includes series/world keys).
    expect(ctx.fingerprint.contextHash.length).toBeGreaterThan(10);
    expect(ctx.fingerprint.memoryCount).toBeGreaterThan(0);

    const pack = buildTranslationPack(db, {
      projectId: vol2,
      chapterIds: [chapter.id],
      style: 'balanced',
      context: ctx,
      editionId: edition2,
    });
    expect(pack.prompt).toContain('[series:naming]');
    expect(pack.prompt).toContain('SERIES glossary');
    expect(pack.prompt).toContain('青云门');
    expect(pack.prompt).toContain('张小凡');
    expect(pack.prompt).toContain('筑基');
  });

  it('export series knowledge has no credential fields', () => {
    const series = service.createSeries({ title: 'Export' });
    createSeriesTerm(series.id, '导出', 'export');
    const payload = service.exportSeriesKnowledge(series.id);
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/cookie|password|token|secret/i);
    expect(payload.kind).toBe('khepree-series-knowledge');
    expect(payload.terms.length).toBe(1);
  });
});
