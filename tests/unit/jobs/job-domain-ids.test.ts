import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { JobService } from '@main/services/job-service';
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';
import {
  getTranslationCampaignService,
  resetTranslationCampaignServiceForTests,
} from '@main/services/translation-campaign-service';
import { resetTranslationRecipeServiceForTests } from '@main/services/translation-recipe-service';
import { resetJobServiceForTests } from '@main/services/job-service-singleton';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';

describe('job domain IDs + notebook singleton', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-job-ids-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetFictionSeriesServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetTranslationRecipeServiceForTests();
    resetJobServiceForTests();
  });

  afterEach(() => {
    resetJobServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('exposes seriesId/worldId/campaignId/chapterIds on job DTO', async () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'ID Novel' });
    ensureDefaultEdition(db, project.id);
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '足够长的源文本用于排队翻译作业。',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '足够长的源文本用于排队翻译作业。',
    });

    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'ID Series' });
    seriesSvc.assignProjectToSeries({
      projectId: project.id,
      seriesId: series.id,
      force: true,
    });
    db.fictionSeries.setWorldKnowledgeJson(
      series.id,
      JSON.stringify({ realm: 'test' }),
    );

    const campaign = await getTranslationCampaignService().create({
      title: 'ID Campaign',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [project.id],
    });

    const jobs = new JobService(db).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapter.id],
      campaignId: campaign.campaignId,
      skipTranslated: true,
    });

    expect(jobs.jobs).toHaveLength(1);
    const job = jobs.jobs[0]!;
    expect(job.projectId).toBe(project.id);
    expect(job.chapterIds).toEqual([chapter.id]);
    expect(job.campaignId).toBe(campaign.campaignId);
    expect(job.seriesId).toBe(series.id);
    expect(job.worldId).toBe(series.id);
  });
});
