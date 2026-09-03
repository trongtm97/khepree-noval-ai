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
import {
  CampaignPipelineOrchestrator,
  resetCampaignPipelineOrchestratorForTests,
} from '@main/campaign-pipeline/campaign-pipeline-orchestrator';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';
import { buildStageIdempotencyKey } from '@shared/constants/campaign-pipeline';
import { newId } from '@main/db/utils/uuid';

function seedNovel(
  title: string,
  opts?: {
    chapters?: number;
    allTranslated?: boolean;
    humanLocked?: boolean;
    sourceStatus?: string;
  },
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
    if (opts?.allTranslated || opts?.humanLocked) {
      db.translations.upsert({
        paragraph_id: para.id,
        edition_id: editionId,
        translated_text: `Bản dịch chương ${i}`,
        version_source: opts?.humanLocked ? 'HUMAN_EDIT' : 'AI_INITIAL',
        human_locked: opts?.humanLocked === true,
      });
    }
  }
  return project.id;
}

describe('campaign durable pipeline', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-pipeline-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetTranslationRecipeServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetCampaignPipelineOrchestratorForTests();
    resetJobServiceForTests();
  });

  afterEach(() => {
    closeDatabase();
    resetTranslationRecipeServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetCampaignPipelineOrchestratorForTests();
    resetJobServiceForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('resumes after crash at stage boundary without re-running completed stages', async () => {
    const db = getDatabase();
    const projectId = seedNovel('Bound', { chapters: 1 });
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const plan = await service.create({
      title: 'CrashBound',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [projectId],
    });
    const token = newId();
    db.translationCampaigns.updateCampaign(plan.campaignId, {
      status: 'READY',
      startToken: token,
      planJson: JSON.stringify(plan),
    });
    const orch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });
    orch.bootstrapRuns({
      campaignId: plan.campaignId,
      startToken: token,
      recipeMode: 'QUICK',
      projectIds: [projectId],
    });
    const run = db.campaignPipeline.listRunsByCampaign(plan.campaignId)[0]!;
    await orch.tickRun(run.id);

    const intake = db.campaignPipeline.getStage(run.id, 'INTAKE');
    expect(intake?.status).toBe('COMPLETED');

    db.campaignPipeline.updateRun(run.id, {
      currentStage: 'PREFLIGHT',
      status: 'RUNNING',
    });
    for (const stage of [
      'PREFLIGHT',
      'BOOTSTRAP',
      'TRANSLATION',
      'QA_REPAIR',
      'WHOLE_BOOK_AUDIT',
      'DELIVERY',
    ] as const) {
      const row = db.campaignPipeline.getStage(run.id, stage);
      if (!row) continue;
      db.campaignPipeline.updateStage(row.id, {
        status: 'PENDING',
        finishedAt: null,
      });
    }

    await orch.tickRun(run.id);

    const intakeAfter = db.campaignPipeline.getStage(run.id, 'INTAKE');
    expect(intakeAfter?.status).toBe('COMPLETED');
    const key = buildStageIdempotencyKey({
      campaignId: plan.campaignId,
      projectId,
      stage: 'INTAKE',
      startToken: token,
      attempt: intakeAfter!.attempt,
    });
    expect(db.campaignPipeline.getStageByIdempotencyKey(key)?.status).toBe(
      'COMPLETED',
    );
  });

  it('crash after translation enqueue keeps side effect once on retry', async () => {
    const db = getDatabase();
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const projectId = seedNovel('SideFx', { chapters: 2 });
    const plan = await service.create({
      title: 'CrashSE',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [projectId],
    });
    const token = newId();

    db.translationCampaigns.updateCampaign(plan.campaignId, {
      status: 'READY',
      startToken: token,
    });
    const orchCrash = new CampaignPipelineOrchestrator(db, {
      skipBrowser: true,
      crashAfterSideEffect: 'translationEnqueued',
    });
    orchCrash.bootstrapRuns({
      campaignId: plan.campaignId,
      startToken: token,
      recipeMode: 'QUICK',
      projectIds: [projectId],
    });

    const run = db.campaignPipeline.listRunsByCampaign(plan.campaignId)[0]!;
    await expect(orchCrash.tickRun(run.id)).rejects.toThrow(/translationEnqueued/);

    const stage = db.campaignPipeline.getStage(run.id, 'TRANSLATION')!;
    const effects = db.campaignPipeline.parseSideEffects(stage);
    expect(effects.translationEnqueued).toBe(true);
    const jobsAfterCrash = db.translationCampaigns.listJobs(plan.campaignId).length;
    expect(jobsAfterCrash).toBeGreaterThan(0);

    // Resume without crash — must not enqueue again
    const orch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });
    db.campaignPipeline.updateRun(run.id, {
      currentStage: 'TRANSLATION',
      status: 'RUNNING',
    });
    // Stage left RUNNING with side effect — tick again
    await orch.tickRun(run.id);
    expect(db.translationCampaigns.listJobs(plan.campaignId).length).toBe(
      jobsAfterCrash,
    );
  });

  it('project A failure does not stop B and C', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const a = seedNovel('FailA', { chapters: 1 });
    const b = seedNovel('OkB', { chapters: 1 });
    const c = seedNovel('OkC', { chapters: 1 });

    const plan = await service.create({
      title: 'Isolate',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [a, b, c],
    });
    const token = newId();
    await service.start(plan.campaignId, token);

    const db = getDatabase();
    const runs = db.campaignPipeline.listRunsByCampaign(plan.campaignId);
    expect(runs.length).toBe(3);

    const runA = runs.find((r) => r.project_id === a)!;
    db.campaignPipeline.updateRun(runA.id, {
      status: 'FAILED_FINAL',
      errorCode: 'FORCED',
      errorMessage: 'forced failure',
    });
    db.translationCampaigns.updateProject(plan.campaignId, a, {
      status: 'FAILED',
    });

    const orch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });
    for (const run of runs.filter((r) => r.project_id !== a)) {
      for (let i = 0; i < 10; i += 1) {
        const live = db.campaignPipeline.getRunById(run.id)!;
        if (
          live.status === 'COMPLETED' ||
          live.status === 'NEEDS_ATTENTION' ||
          live.status === 'FAILED_FINAL'
        ) {
          break;
        }
        const tr = db.campaignPipeline.getStage(run.id, 'TRANSLATION');
        if (tr) {
          for (const jobId of db.campaignPipeline.parseCheckpoint(tr).jobIds ?? []) {
            const job = db.jobs.getById(jobId);
            if (job && !['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(job.state)) {
              db.jobs.updateState(jobId, 'COMPLETED');
            }
          }
        }
        // Mark chapters translated so PUBLICATION-like audits pass for QUICK path
        const project = db.projects.getById(run.project_id)!;
        for (const ch of db.chapters.listByProject(run.project_id)) {
          for (const para of db.paragraphs.listByChapter(ch.id)) {
            db.translations.upsert({
              paragraph_id: para.id,
              edition_id: project.active_edition_id!,
              translated_text: 'ok',
              version_source: 'AI_INITIAL',
            });
          }
        }
        await orch.tickRun(run.id);
      }
    }

    orch.reconcileCampaignStatus(plan.campaignId);
    expect(db.campaignPipeline.getRunById(runA.id)?.status).toBe('FAILED_FINAL');
    expect(db.campaignPipeline.getRunById(runs.find((r) => r.project_id === b)!.id)?.status).toBe(
      'COMPLETED',
    );
    expect(db.campaignPipeline.getRunById(runs.find((r) => r.project_id === c)!.id)?.status).toBe(
      'COMPLETED',
    );
    expect(db.translationCampaigns.getById(plan.campaignId)?.status).toBe('PARTIAL_FAILED');
  });

  it('QUICK skips whole-book audit; PUBLICATION flags critical gaps as NEEDS_ATTENTION', async () => {
    const db = getDatabase();
    const orch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });

    const quickId = seedNovel('QuickBook', { chapters: 1 });
    // Mark translated so TRANSLATION finishes with 0 jobs, pipeline reaches audit
    const qProject = db.projects.getById(quickId)!;
    for (const ch of db.chapters.listByProject(quickId)) {
      for (const para of db.paragraphs.listByChapter(ch.id)) {
        db.translations.upsert({
          paragraph_id: para.id,
          edition_id: qProject.active_edition_id!,
          translated_text: 'done',
          version_source: 'AI_INITIAL',
        });
      }
    }

    const service = getTranslationCampaignService({ skipProviderCheck: true });
    // Create campaign rows without start (all translated may block start)
    const quickPlan = await service.create({
      title: 'Q',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [quickId],
    });
    // Force READY even if preflight says blocked
    const qToken = newId();
    db.translationCampaigns.updateCampaign(quickPlan.campaignId, {
      status: 'RUNNING',
      startToken: qToken,
    });
    orch.bootstrapRuns({
      campaignId: quickPlan.campaignId,
      startToken: qToken,
      recipeMode: 'QUICK',
      projectIds: [quickId],
    });
    const qRun = db.campaignPipeline.listRunsByCampaign(quickPlan.campaignId)[0]!;
    for (let i = 0; i < 10; i += 1) {
      const run = db.campaignPipeline.getRunById(qRun.id)!;
      if (run.status === 'COMPLETED') break;
      const tr = db.campaignPipeline.getStage(run.id, 'TRANSLATION');
      if (tr) {
        for (const jobId of db.campaignPipeline.parseCheckpoint(tr).jobIds ?? []) {
          const job = db.jobs.getById(jobId);
          if (job && !['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(job.state)) {
            db.jobs.updateState(jobId, 'COMPLETED');
          }
        }
      }
      await orch.tickRun(qRun.id);
    }
    const auditQuick = db.campaignPipeline.getStage(qRun.id, 'WHOLE_BOOK_AUDIT');
    expect(auditQuick?.status).toBe('SKIPPED');

    const pubId = seedNovel('PubBook', { chapters: 1 });
    const pubPlan = await service.create({
      title: 'P',
      recipeId: BUILTIN_RECIPE_IDS.PUBLICATION,
      projectIds: [pubId],
    });
    const pubToken = newId();
    db.translationCampaigns.updateCampaign(pubPlan.campaignId, {
      status: 'RUNNING',
      startToken: pubToken,
      planJson: JSON.stringify(pubPlan),
    });
    const pubOrch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });
    pubOrch.bootstrapRuns({
      campaignId: pubPlan.campaignId,
      startToken: pubToken,
      recipeMode: 'PUBLICATION',
      projectIds: [pubId],
    });
    const pubRun = db.campaignPipeline.listRunsByCampaign(pubPlan.campaignId)[0]!;
    for (let i = 0; i < 12; i += 1) {
      const run = db.campaignPipeline.getRunById(pubRun.id)!;
      if (
        run.status === 'NEEDS_ATTENTION' ||
        run.status === 'COMPLETED' ||
        run.status === 'FAILED_FINAL'
      ) {
        break;
      }
      const tr = db.campaignPipeline.getStage(run.id, 'TRANSLATION');
      if (tr) {
        const effects = db.campaignPipeline.parseSideEffects(tr);
        if (effects.translationEnqueued) {
          for (const jobId of db.campaignPipeline.parseCheckpoint(tr).jobIds ?? []) {
            const job = db.jobs.getById(jobId);
            if (job && !['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(job.state)) {
              db.jobs.updateState(jobId, 'COMPLETED');
            }
          }
        }
      }
      await pubOrch.tickRun(pubRun.id);
    }
    const pubFinal = db.campaignPipeline.getRunById(pubRun.id)!;
    expect(pubFinal.status).toBe('NEEDS_ATTENTION');
    const auditPub = db.campaignPipeline.getStage(pubRun.id, 'WHOLE_BOOK_AUDIT');
    const qaRepair = db.campaignPipeline.getStage(pubRun.id, 'QA_REPAIR');
    // Prompt 09: strict QA_REPAIR may flag first; else WHOLE_BOOK_AUDIT.
    expect(
      auditPub?.status === 'NEEDS_ATTENTION' ||
        qaRepair?.status === 'NEEDS_ATTENTION',
    ).toBe(true);
  });

  it('pause/cancel/restart and account change mid-pipeline', async () => {
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const projectId = seedNovel('CtrlPipe', { chapters: 2 });
    const plan = await service.create({
      title: 'Ctrl',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [projectId],
    });
    const token = newId();
    await service.start(plan.campaignId, token);

    const paused = service.pause(plan.campaignId);
    expect(paused.status).toBe('PAUSED');
    const db = getDatabase();
    const run = db.campaignPipeline.listRunsByCampaign(plan.campaignId)[0]!;
    expect(run.status).toBe('PAUSED');

    const resumed = service.resume(plan.campaignId);
    expect(resumed.status).toBe('RUNNING');

    // Account change: restart BOOTSTRAP with preferred account on orchestrator
    const orch = new CampaignPipelineOrchestrator(db, {
      skipBrowser: true,
      preferredAccountId: 'account-changed-1',
    });
    orch.restartFromStage(plan.campaignId, projectId, 'BOOTSTRAP');
    await orch.tickRun(run.id);
    const boot = db.campaignPipeline.getStage(run.id, 'BOOTSTRAP');
    const cp = boot ? db.campaignPipeline.parseCheckpoint(boot) : {};
    expect(cp.accountId === 'account-changed-1' || boot?.status === 'PENDING').toBeTruthy();

    service.cancel(plan.campaignId);
    expect(db.translationCampaigns.getById(plan.campaignId)?.status).toBe(
      'CANCELLED',
    );
    expect(db.campaignPipeline.getRunById(run.id)?.status).toBe('CANCELLED');
  });

  it('protects human_locked count in QA checkpoint', async () => {
    const db = getDatabase();
    const projectId = seedNovel('Locked', { chapters: 1 });
    const project = db.projects.getById(projectId)!;
    for (const ch of db.chapters.listByProject(projectId)) {
      for (const para of db.paragraphs.listByChapter(ch.id)) {
        db.translations.upsert({
          paragraph_id: para.id,
          edition_id: project.active_edition_id!,
          translated_text: 'human edit',
          version_source: 'HUMAN_EDIT',
          human_locked: true,
        });
      }
    }

    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const plan = await service.create({
      title: 'Lock',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [projectId],
    });
    const token = newId();
    db.translationCampaigns.updateCampaign(plan.campaignId, {
      status: 'RUNNING',
      startToken: token,
    });
    const orch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });
    orch.bootstrapRuns({
      campaignId: plan.campaignId,
      startToken: token,
      recipeMode: 'BALANCED',
      projectIds: [projectId],
    });
    const run = db.campaignPipeline.listRunsByCampaign(plan.campaignId)[0]!;
    for (let i = 0; i < 10; i += 1) {
      const r = db.campaignPipeline.getRunById(run.id)!;
      if (r.status === 'COMPLETED') break;
      const tr = db.campaignPipeline.getStage(r.id, 'TRANSLATION');
      if (tr) {
        for (const jobId of db.campaignPipeline.parseCheckpoint(tr).jobIds ?? []) {
          const job = db.jobs.getById(jobId);
          if (job && !['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(job.state)) {
            db.jobs.updateState(jobId, 'COMPLETED');
          }
        }
      }
      await orch.tickRun(run.id);
    }
    const qa = db.campaignPipeline.getStage(run.id, 'QA_REPAIR');
    expect(qa?.status).toBe('COMPLETED');
    const cp = db.campaignPipeline.parseCheckpoint(qa!);
    expect(cp.humanLockedCount).toBeGreaterThanOrEqual(1);
  });

  it('retry same idempotency key does not duplicate side effects', async () => {
    const db = getDatabase();
    const service = getTranslationCampaignService({ skipProviderCheck: true });
    const projectId = seedNovel('IdemKey', { chapters: 1 });
    const plan = await service.create({
      title: 'Idem',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [projectId],
    });
    const token = newId();
    await service.start(plan.campaignId, token);
    const jobs = db.translationCampaigns.listJobs(plan.campaignId).length;
    const run = db.campaignPipeline.listRunsByCampaign(plan.campaignId)[0]!;
    const stage = db.campaignPipeline.getStage(run.id, 'TRANSLATION')!;
    const key = stage.idempotency_key;

    // Re-tick with same key while COMPLETED/RUNNING — no new jobs
    const orch = new CampaignPipelineOrchestrator(db, { skipBrowser: true });
    await orch.tickRun(run.id);
    expect(db.campaignPipeline.getStageByIdempotencyKey(key)?.idempotency_key).toBe(
      key,
    );
    expect(db.translationCampaigns.listJobs(plan.campaignId).length).toBe(jobs);
  });
});
