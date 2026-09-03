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
import { CAMPAIGN_APP_META_LIMIT_KEYS } from '@shared/constants/translation-campaign';
import { newId } from '@main/db/utils/uuid';

function seedNovel(
  title: string,
  opts?: { chapters?: number; sourceStatus?: string; allTranslated?: boolean },
): string {
  const db = getDatabase();
  const project = db.projects.create({ title });
  ensureDefaultEdition(db, project.id);
  const chapterCount = opts?.chapters ?? 2;
  const editionId = db.projects.getById(project.id)!.active_edition_id!;
  for (let i = 1; i <= chapterCount; i += 1) {
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: i,
      sequence_order: i,
      source_text: `第${i}章 内容足够长 để dịch.`,
      source_status: (opts?.sourceStatus as 'SOURCE_READY') ?? 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: `[C${String(i).padStart(6, '0')}:P000001]`,
      sequence: 1,
      source_text: `第${i}章 内容足够长 để dịch.`,
    });
    if (opts?.allTranslated) {
      db.translations.upsert({
        paragraph_id: para.id,
        edition_id: editionId,
        translated_text: `Bản dịch chương ${i}`,
        version_source: 'AI_INITIAL',
      });
    }
  }
  return project.id;
}

describe('translation campaign plan + start', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-campaign-'));
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

  it('handles 0 / 1 / many projects and duplicate ids', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const empty = await service.create({
      title: 'Empty',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [],
    });
    expect(empty.canStart).toBe(false);
    expect(empty.estimate.projectCount).toBe(0);

    const a = seedNovel('Alpha');
    const one = await service.create({
      title: 'One',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [a],
    });
    expect(one.estimate.projectCount).toBe(1);
    expect(one.canStart).toBe(true);
    expect(one.estimate.runnableCount).toBe(1);

    const b = seedNovel('Beta');
    const c = seedNovel('Gamma');
    const many = await service.create({
      title: 'Many',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [a, b, c, a, b],
    });
    expect(many.estimate.projectCount).toBe(3);
    expect(many.canStart).toBe(true);
  });

  it('marks blockers NEEDS_ATTENTION while runnable projects can still start', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const ok = seedNovel('OK');
    const conflict = seedNovel('Conflict', { sourceStatus: 'SOURCE_CONFLICT' });
    const empty = getDatabase().projects.create({ title: 'NoChapters' }).id;
    ensureDefaultEdition(getDatabase(), empty);

    const plan = await service.create({
      title: 'Partial',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [ok, conflict, empty],
    });
    expect(plan.estimate.runnableCount).toBe(1);
    expect(plan.estimate.needsAttentionCount).toBe(2);
    expect(plan.canStart).toBe(true);
    expect(plan.projects.find((p) => p.projectId === conflict)?.status).toBe('NEEDS_ATTENTION');
    expect(plan.projects.find((p) => p.projectId === empty)?.blockerCode).toBe('NO_CHAPTERS');

    const allBlocked = await service.create({
      title: 'Blocked',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [conflict, empty],
    });
    expect(allBlocked.canStart).toBe(false);
    expect(allBlocked.estimate.runnableCount).toBe(0);
  });

  it('start is idempotent for same token and does not duplicate jobs', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const a = seedNovel('Story', { chapters: 2 });
    const plan = await service.create({
      title: 'Idem',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [a],
    });
    const token = newId();
    const first = await service.start(plan.campaignId, token);
    expect(first.idempotentReplay).toBe(false);
    expect(first.jobsCreated).toBeGreaterThan(0);
    const jobsAfterFirst = getDatabase().translationCampaigns.listJobs(plan.campaignId).length;

    const second = await service.start(plan.campaignId, token);
    expect(second.idempotentReplay).toBe(true);
    expect(second.jobsCreated).toBe(0);
    expect(getDatabase().translationCampaigns.listJobs(plan.campaignId).length).toBe(
      jobsAfterFirst,
    );

    const third = await service.start(plan.campaignId, newId());
    expect(third.idempotentReplay).toBe(true);
    expect(getDatabase().translationCampaigns.listJobs(plan.campaignId).length).toBe(
      jobsAfterFirst,
    );
  });

  it('respects capability max projects / max concurrent novels via app_meta', async () => {
    const db = getDatabase();
    db.appMeta.set(CAMPAIGN_APP_META_LIMIT_KEYS.maxProjects, '2');
    db.appMeta.set(CAMPAIGN_APP_META_LIMIT_KEYS.maxConcurrentNovels, '1');

    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const limits = service.getCapabilityLimits();
    expect(limits.maxProjects).toBe(2);
    expect(limits.maxConcurrentNovels).toBe(1);

    const ids = [seedNovel('A'), seedNovel('B'), seedNovel('C')];
    await expect(
      service.create({
        title: 'Over',
        recipeId: BUILTIN_RECIPE_IDS.BALANCED,
        projectIds: ids,
      }),
    ).rejects.toThrow(/campaign\.max_projects/i);

    const two = await service.create({
      title: 'Cap',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: ids.slice(0, 2),
    });
    expect(two.estimate.capabilityMaxProjects).toBe(2);
    expect(two.estimate.capabilityMaxConcurrentNovels).toBe(1);

    const started = await service.start(two.campaignId, newId());
    expect(started.projectsStarted).toBe(1);
    const statuses = db.translationCampaigns.listProjects(two.campaignId).map((p) => p.status);
    expect(statuses.filter((s) => s === 'QUEUED' || s === 'RUNNING').length).toBe(1);
    expect(statuses.filter((s) => s === 'READY').length).toBe(1);
  });

  it('pause / resume / cancel keep translations and clear queued work on cancel', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const a = seedNovel('Keep', { chapters: 1 });
    const plan = await service.create({
      title: 'Ctrl',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [a],
    });
    await service.start(plan.campaignId, newId());
    const paused = service.pause(plan.campaignId);
    expect(paused.status).toBe('PAUSED');
    const resumed = service.resume(plan.campaignId);
    expect(resumed.status).toBe('RUNNING');
    const cancelled = service.cancel(plan.campaignId);
    expect(cancelled.status).toBe('CANCELLED');
    const jobs = getDatabase().translationCampaigns.listJobIds(plan.campaignId);
    for (const jobId of jobs) {
      expect(getDatabase().jobs.getById(jobId)?.state).toBe('CANCELLED');
    }
  });
});
