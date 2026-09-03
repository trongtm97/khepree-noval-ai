import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { ensureDefaultEdition } from '@main/services/edition-service';
import {
  getTranslationCampaignService,
  resetTranslationCampaignServiceForTests,
} from '@main/services/translation-campaign-service';
import { resetTranslationRecipeServiceForTests } from '@main/services/translation-recipe-service';
import { resetJobServiceForTests } from '@main/services/job-service-singleton';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';

function seedNovel(title: string): string {
  const db = getDatabase();
  const project = db.projects.create({ title });
  ensureDefaultEdition(db, project.id);
  const chapter = db.chapters.create({
    project_id: project.id,
    chapter_number: 1,
    sequence_order: 1,
    source_text: '第一章 内容足够长 để dịch.',
    source_status: 'SOURCE_READY',
  });
  db.paragraphs.create({
    chapter_id: chapter.id,
    paragraph_id: '[C000001:P000001]',
    sequence: 1,
    source_text: '第一章 内容足够长 để dịch.',
  });
  return project.id;
}

describe('Prompt 12 — campaign list/detail enrichment', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-prod12-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetTranslationRecipeServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetJobServiceForTests();
  });

  afterEach(() => {
    closeDatabase();
    resetTranslationRecipeServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetJobServiceForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('list returns progress/counts/recipe and scales to 100+ projects in one campaign', async () => {
    const service = getTranslationCampaignService({
      skipProviderCheck: true,
      limits: { maxProjects: 200, maxConcurrentNovels: 5, source: 'lease_override' },
    });
    const ids: string[] = [];
    for (let i = 0; i < 105; i += 1) {
      ids.push(seedNovel(`Novel ${i}`));
    }
    const plan = await service.create({
      title: 'Big batch',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: ids,
    });
    expect(plan.projects.length).toBe(105);

    const list = service.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const item = list.find((c) => c.campaignId === plan.campaignId)!;
    expect(item.recipeMode).toBeTruthy();
    expect(item.recipeName).toBeTruthy();
    expect(item.projectCount).toBe(105);
    expect(item.progressPercent).toBeGreaterThanOrEqual(0);
    expect(typeof item.completedCount).toBe('number');
    expect(typeof item.attentionCount).toBe('number');
    expect(['insufficient_history', 'local_history']).toContain(item.estimateBasis);

    const detail = service.getDetail(plan.campaignId);
    expect(detail.projects.length).toBe(105);
    expect(detail.advanced).toBeTruthy();
  }, 120_000);

  it('pause then resume updates status; cancel keeps translations', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const projectId = seedNovel('One');
    const plan = await service.create({
      title: 'Control',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [projectId],
    });
    const start = await service.start(plan.campaignId, 'token-prod12-control-01');
    expect(['RUNNING', 'STARTING', 'COMPLETED', 'PARTIAL_FAILED']).toContain(
      start.status,
    );

    const paused = service.pause(plan.campaignId);
    expect(paused.status).toBe('PAUSED');
    const resumed = service.resume(plan.campaignId);
    expect(resumed.status).toBe('RUNNING');
    const cancelled = service.cancel(plan.campaignId);
    expect(cancelled.status).toBe('CANCELLED');

    const db = getDatabase();
    const chapters = db.chapters.listByProject(projectId);
    expect(chapters.length).toBe(1);
    const paras = db.paragraphs.listByChapter(chapters[0]!.id);
    expect(paras.length).toBeGreaterThan(0);
  });
});
