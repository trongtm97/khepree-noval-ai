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
