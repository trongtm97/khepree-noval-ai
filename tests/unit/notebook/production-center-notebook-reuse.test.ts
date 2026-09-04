import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { JobService } from '@main/services/job-service';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';
import {
  getTranslationCampaignService,
  resetTranslationCampaignServiceForTests,
} from '@main/services/translation-campaign-service';
import { resetTranslationRecipeServiceForTests } from '@main/services/translation-recipe-service';
import { resetJobServiceForTests } from '@main/services/job-service-singleton';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';
import { handleTranslation } from '@main/campaign-pipeline/stage-handlers';
import { resolveTranslationNotebook } from '@main/notebook/notebook-resolver';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';
import { buildStageIdempotencyKey } from '@shared/constants/campaign-pipeline';
import { getBuiltinRecipe } from '@shared/constants/translation-recipe-defs';

/**
 * HARD REQUIREMENT 16 — Production Center reuses story NotebookLM binding.
 *
 * Translate tab Story A → Notebook A
 * Production Center job Story A → same Notebook A
 * Retry Story A → same Notebook A
 * Restart application → same Notebook A
 */
describe('HR16 Production Center reuses story notebook', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-prod-nb-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetNotebookBindingServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetTranslationRecipeServiceForTests();
    resetJobServiceForTests();
  });

  afterEach(() => {
    resetJobServiceForTests();
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function seedStoryA() {
    const db = getDatabase();
    const project = db.projects.create({ title: 'Story A' });
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
    const translateAccount = db.googleAccounts.create({
      label: 'Translate',
      email: 'translate@test.com',
      displayName: 'Translate',
      profileDirName: 'profile-translate',
    });
    const productionAccount = db.googleAccounts.create({
      label: 'Production',
      email: 'production@test.com',
      displayName: 'Production',
      profileDirName: 'profile-production',
    });
    return { db, project, chapter, translateAccount, productionAccount };
  }

  it('Translate → Production → retry → restart all resolve Notebook A', async () => {
    const { db, project, chapter, translateAccount, productionAccount } =
      seedStoryA();
    const bindingSvc = getNotebookBindingService();

    // ——— Translate tab for Story A creates/persists Notebook A ———
    bindingSvc.persistBinding({
      projectId: project.id,
      accountId: translateAccount.id,
      notebookName: '[Khepree] Story A',
      role: 'SINGLE',
      notebookId: 'notebook-A',
      notebookUrl: 'https://notebook.google.com/n/notebook-A',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T12:00:00.000Z',
    });
    expect(bindingSvc.getNotebookForStory(project.id)?.notebookId).toBe(
      'notebook-A',
    );

    // ——— Production Center job for Story A → same Notebook A ———
    const campaign = await getTranslationCampaignService().create({
      title: 'Production Story A',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [project.id],
    });
    const productionJobs = new JobService(db).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapter.id],
      campaignId: campaign.campaignId,
      skipTranslated: true,
    });
    expect(productionJobs.jobs).toHaveLength(1);
    expect(productionJobs.jobs[0]!.projectId).toBe(project.id);

    const productionBinding = bindingSvc.resolveNotebookForProductionJob(
      productionJobs.jobs[0]!.projectId,
    );
    expect(productionBinding?.notebookId).toBe('notebook-A');

    // Different worker account still resolves story Notebook A (HR16 fallback).
    const viaOtherWorker = resolveTranslationNotebook(
      db,
      project.id,
      productionAccount.id,
    );
    expect(viaOtherWorker?.notebook_id).toBe('notebook-A');

    // Production resolve is read-only — never create.
    const ensure = vi.fn();
    expect(
      bindingSvc.resolveNotebookForProductionJob(project.id)?.notebookId,
    ).toBe('notebook-A');
    expect(ensure).not.toHaveBeenCalled();

    // ——— Retry Story A → same Notebook A ———
    const page = {
      url: () => 'https://notebook.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;
    const retryProvider = {
      findNotebookByName: async (name: string) => ({
        name,
        id: 'notebook-A',
        url: 'https://notebook.google.com/n/notebook-A',
      }),
      ensureNotebook: ensure,
      openNotebook: async (name: string) => ({
        name,
        id: 'notebook-A',
        url: 'https://notebook.google.com/n/notebook-A',
      }),
    } as unknown as NotebookProvider;

    const retry = await bindingSvc.reuseNotebookBindingForRetry({
      projectId: project.id,
      accountId: translateAccount.id,
      preferredName: '[Khepree] Story A',
      role: 'SINGLE',
      provider: retryProvider,
      page,
    });
    expect(retry.outcome).toBe('reused');
    expect(retry.binding.notebookId).toBe('notebook-A');
    expect(ensure).not.toHaveBeenCalled();

    // Production job still keyed by story projectId → same Notebook A.
    const jobAgain = new JobService(db).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapter.id],
      campaignId: campaign.campaignId,
      skipTranslated: true,
    });
    expect(
      bindingSvc.resolveNotebookForProductionJob(
        jobAgain.jobs[0]?.projectId ?? project.id,
      )?.notebookId,
    ).toBe('notebook-A');

    // ——— Restart application → same Notebook A ———
    resetNotebookBindingServiceForTests();
    const afterRestart = getNotebookBindingService().getNotebookForStory(
      project.id,
    );
    expect(afterRestart?.notebookId).toBe('notebook-A');
    expect(
      getNotebookBindingService().resolveNotebookForProductionJob(project.id)
        ?.notebookId,
    ).toBe('notebook-A');
  });

  it('handleTranslation checkpoint records story notebookId without creating', async () => {
    const { db, project, translateAccount } = seedStoryA();
    getNotebookBindingService().persistBinding({
      projectId: project.id,
      accountId: translateAccount.id,
      notebookName: '[Khepree] Story A',
      role: 'SINGLE',
      notebookId: 'notebook-A',
      notebookUrl: 'https://notebook.google.com/n/notebook-A',
      status: 'ready',
    });

    const campaign = await getTranslationCampaignService().create({
      title: 'PC Campaign',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [project.id],
    });

    const startToken = `hr16-${Date.now()}`;
    const run = db.campaignPipeline.createRun({
      campaignId: campaign.campaignId,
      projectId: project.id,
      startToken,
      recipeMode: 'QUICK',
      currentStage: 'TRANSLATION',
      status: 'RUNNING',
    });
    const stageRow = db.campaignPipeline.ensureStage({
      runId: run.id,
      stage: 'TRANSLATION',
      attempt: 1,
      idempotencyKey: buildStageIdempotencyKey({
        campaignId: campaign.campaignId,
        projectId: project.id,
        stage: 'TRANSLATION',
        startToken,
        attempt: 1,
      }),
    });

    const recipeConfig = getBuiltinRecipe(BUILTIN_RECIPE_IDS.QUICK)!.config;

    const result = await handleTranslation({
      db,
      campaignId: campaign.campaignId,
      projectId: project.id,
      runId: run.id,
      stage: 'TRANSLATION',
      recipeMode: 'QUICK',
      recipeConfig,
      startToken,
      attempt: 1,
      stageRow,
      skipBrowser: true,
    });

    expect(result.checkpoint?.notebookId).toBe('notebook-A');
    expect(
      getNotebookBindingService().getNotebookForStory(project.id)?.notebookId,
    ).toBe('notebook-A');
    expect(
      db.notebooks
        .listByProject(project.id)
        .filter((r) => r.notebook_role === 'SINGLE' && !r.deprecated_at),
    ).toHaveLength(1);
  });
});
