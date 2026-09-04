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
});
