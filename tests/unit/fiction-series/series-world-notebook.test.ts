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
import { NotebookKnowledgeBuilder } from '@main/notebook/knowledge-builder';
import {
  buildStoryKnowledgeSnapshot,
  worldEntriesForTranslation,
} from '@main/knowledge/story-knowledge-snapshot';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';

describe('Series/World → Notebook + Translation canonical knowledge', () => {
  let tempRoot: string;
  let service: FictionSeriesService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-series-world-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    service = new FictionSeriesService(() => getDatabase());
  });

  afterEach(() => {
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('A: series world knowledge appears in Notebook world_knowledge', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Tiên Nghịch' });
    const projectId = db.projects.create({ title: 'Tập 1' }).id;
    service.assignProjectToSeries({
      seriesId: series.id,
      projectId,
      force: true,
    });

    service.setWorldKnowledge(series.id, {
      tong_mon: 'Thanh Vân Môn',
      canh_gioi: 'Luyện Khí',
    });

    const snapshot = buildStoryKnowledgeSnapshot(db, projectId);
    expect(snapshot.worldKnowledge['series:tong_mon']).toBe('Thanh Vân Môn');

    const md = new NotebookKnowledgeBuilder(db).buildWorldKnowledge(projectId);
    expect(md).toContain('Thanh Vân Môn');
    expect(md).toContain('Luyện Khí');

    const translationEntries = worldEntriesForTranslation(db, projectId, 999);
    expect(translationEntries.some((e) => e.key === 'series:tong_mon')).toBe(true);
  });

  it('B: world edit updates same Notebook binding, no new notebook', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Bộ A' });
    const projectId = db.projects.create({ title: 'Vol 1' }).id;
    service.assignProjectToSeries({
      seriesId: series.id,
      projectId,
      force: true,
    });

    const account = db.googleAccounts.create({
      label: 'acc',
      email: 'a@example.com',
      profileDirName: 'p1',
      status: 'READY',
    });

    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: account.id,
      notebook_name: 'Story NB',
      notebook_id: 'nb-primary-1',
      resource_url: 'https://notebooklm.google.com/notebook/nb-primary-1',
      notebook_role: 'SINGLE',
      status: 'ready',
    });

    const binder = getNotebookBindingService();
    const before = binder.getNotebookForStory(projectId);
    expect(before?.notebookId).toBe('nb-primary-1');

    service.setWorldKnowledge(series.id, { fact: 'v1' });
    service.setWorldKnowledge(series.id, { fact: 'v2-updated' });

    const after = binder.getNotebookForStory(projectId);
    expect(after?.notebookId).toBe('nb-primary-1');
    expect(after?.projectId).toBe(before?.projectId);

    const md = new NotebookKnowledgeBuilder(db).buildWorldKnowledge(projectId);
    expect(md).toContain('v2-updated');
  });

  it('C: two projects share series knowledge but own Notebook bindings', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Shared' });
    const p1 = db.projects.create({ title: 'Vol1' }).id;
    const p2 = db.projects.create({ title: 'Vol2' }).id;
    service.assignProjectToSeries({ seriesId: series.id, projectId: p1, force: true });
    service.assignProjectToSeries({ seriesId: series.id, projectId: p2, force: true });
    service.setWorldKnowledge(series.id, { realm: 'Tu Tiên' });

    const account = db.googleAccounts.create({
      label: 'acc',
      email: 'b@example.com',
      profileDirName: 'p2',
      status: 'READY',
    });

    db.notebooks.upsert({
      project_id: p1,
      google_account_id: account.id,
      notebook_name: 'NB1',
      notebook_id: 'nb-p1',
      notebook_role: 'SINGLE',
      status: 'ready',
    });
    db.notebooks.upsert({
      project_id: p2,
      google_account_id: account.id,
      notebook_name: 'NB2',
      notebook_id: 'nb-p2',
      notebook_role: 'SINGLE',
      status: 'ready',
    });

    const binder = getNotebookBindingService();
    expect(binder.getNotebookForStory(p1)?.notebookId).toBe('nb-p1');
    expect(binder.getNotebookForStory(p2)?.notebookId).toBe('nb-p2');

    const md1 = new NotebookKnowledgeBuilder(db).buildWorldKnowledge(p1);
    const md2 = new NotebookKnowledgeBuilder(db).buildWorldKnowledge(p2);
    expect(md1).toContain('Tu Tiên');
    expect(md2).toContain('Tu Tiên');
  });

  it('D: world update does not overwrite story-specific data', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'S' });
    const projectId = db.projects.create({ title: 'P' }).id;
    service.assignProjectToSeries({
      seriesId: series.id,
      projectId,
      force: true,
    });

    db.storyStates.patch(projectId, {
      worldKnowledge: {
        local_arc: 'Chỉ tập này',
        shared_key: 'story-wins',
      },
    });

    service.setWorldKnowledge(series.id, {
      shared_key: 'series-value',
      series_only: 'from-series',
    });

    const snapshot = buildStoryKnowledgeSnapshot(db, projectId);
    expect(snapshot.worldKnowledge.local_arc).toBe('Chỉ tập này');
    expect(snapshot.worldKnowledge.shared_key).toBe('story-wins');
    expect(snapshot.worldKnowledge['series:series_only']).toBe('from-series');

    const md = new NotebookKnowledgeBuilder(db).buildWorldKnowledge(projectId);
    expect(md).toContain('Chỉ tập này');
    expect(md).toContain('story-wins');
    expect(md).toContain('from-series');
  });

  it('E: unbound story stays without Notebook after series dirty propagate', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'No NB' });
    const unbound = db.projects.create({ title: 'Unbound Vol' }).id;
    service.assignProjectToSeries({ seriesId: series.id, projectId: unbound, force: true });

    expect(db.notebooks.listByProject(unbound)).toHaveLength(0);

    service.setWorldKnowledge(series.id, { fact: 'shared' });
    service.upsertStyleRule({
      seriesId: series.id,
      kind: 'style',
      content: 'Giữ xưng hô nhất quán',
    });

    expect(db.notebooks.listByProject(unbound)).toHaveLength(0);
    expect(getNotebookBindingService().getNotebookForStory(unbound)).toBeNull();

    expect(db.knowledgeFiles.anyDirty(unbound)).toBe(true);

    const snapshot = buildStoryKnowledgeSnapshot(db, unbound);
    expect(snapshot.worldKnowledge['series:fact']).toBe('shared');
  });

  it('F: rapid series edits coalesce to same binding + final world wins', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Rapid' });
    const projectId = db.projects.create({ title: 'Vol' }).id;
    service.assignProjectToSeries({ seriesId: series.id, projectId, force: true });

    const account = db.googleAccounts.create({
      label: 'acc',
      email: 'rapid@example.com',
      profileDirName: 'rapid-p',
      status: 'READY',
    });
    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: account.id,
      notebook_name: 'Primary',
      notebook_id: 'nb-rapid-1',
      notebook_role: 'SINGLE',
      status: 'ready',
    });

    for (let i = 1; i <= 10; i += 1) {
      service.setWorldKnowledge(series.id, { revision: `v${i}` });
    }

    const notebooks = db.notebooks.listByProject(projectId);
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0]?.notebook_id).toBe('nb-rapid-1');
    expect(getNotebookBindingService().getNotebookForStory(projectId)?.notebookId).toBe(
      'nb-rapid-1',
    );

    const snapshot = buildStoryKnowledgeSnapshot(db, projectId);
    expect(snapshot.worldKnowledge['series:revision']).toBe('v10');
    expect(db.knowledgeFiles.anyDirty(projectId)).toBe(true);
  });

  it('G: after restart dirty remains recoverable without new Notebook', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Crash' });
    const withNb = db.projects.create({ title: 'Has NB' }).id;
    const withoutNb = db.projects.create({ title: 'No NB' }).id;
    service.assignProjectToSeries({ seriesId: series.id, projectId: withNb, force: true });
    service.assignProjectToSeries({ seriesId: series.id, projectId: withoutNb, force: true });

    const account = db.googleAccounts.create({
      label: 'acc',
      email: 'crash@example.com',
      profileDirName: 'crash-p',
      status: 'READY',
    });
    db.notebooks.upsert({
      project_id: withNb,
      google_account_id: account.id,
      notebook_name: 'Keep',
      notebook_id: 'nb-keep-1',
      notebook_role: 'SINGLE',
      status: 'ready',
    });

    service.setWorldKnowledge(series.id, { after_crash: 'recover-me' });

    expect(db.knowledgeFiles.anyDirty(withNb)).toBe(true);
    expect(db.knowledgeFiles.anyDirty(withoutNb)).toBe(true);

    // Simulate app restart by re-reading durable rows (same SQLite connection / fresh service).
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    const restarted = new FictionSeriesService(() => getDatabase());
    const world = restarted.getWorldKnowledge(series.id);
    expect(world.worldKnowledge.after_crash).toBe('recover-me');

    expect(db.notebooks.listByProject(withNb)).toHaveLength(1);
    expect(db.notebooks.listByProject(withoutNb)).toHaveLength(0);
    expect(db.knowledgeFiles.anyDirty(withNb)).toBe(true);
    expect(db.knowledgeFiles.anyDirty(withoutNb)).toBe(true);
    expect(getNotebookBindingService().getNotebookForStory(withNb)?.notebookId).toBe('nb-keep-1');
  });

  it('H: many volumes mark dirty locally without creating notebooks (no remote fan-out)', () => {
    const db = getDatabase();
    const series = service.createSeries({ title: 'Fanout' });
    const projectIds: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const id = db.projects.create({ title: `Vol ${i}` }).id;
      projectIds.push(id);
      service.assignProjectToSeries({ seriesId: series.id, projectId: id, force: true });
    }

    service.setWorldKnowledge(series.id, { blast: 'one-edit' });

    for (const id of projectIds) {
      expect(db.notebooks.listByProject(id)).toHaveLength(0);
      expect(db.knowledgeFiles.anyDirty(id)).toBe(true);
    }
  });
});
