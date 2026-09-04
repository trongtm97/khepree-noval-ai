import {
  CAMPAIGN_APP_META_LIMIT_KEYS,
  CAMPAIGN_CAPABILITY_KEYS,
  CAMPAIGN_DEFAULT_LIMITS,
  CAMPAIGN_EFFORT_WEIGHTS,
  type CampaignBlockerCode,
} from '@shared/constants/translation-campaign';
import { KHEPREE_FEATURES } from '@shared/constants/khepree';
import type { TranslationRecipeConfig } from '@shared/constants/translation-recipe-defs';
import type {
  CampaignDetailDto,
  CampaignListItemDto,
  CampaignPlanDto,
  CampaignProjectPreflightDto,
  CampaignProjectRuntimeDto,
  CampaignStartResultDto,
} from '@shared/schemas/translation-campaign';
import {
  campaignStageProgressPercent,
  shortenAccountLabel,
  shortenProviderLabel,
} from '@shared/utils/campaign-production';
import type { TranslationRecipeOverrideDto } from '@shared/constants/translation-recipe-defs';
import { getDatabase } from '../db/connection';
import { newId } from '../db/utils/uuid';
import { utcNow } from '../db/utils/timestamps';
import { assertKhepreeProductAccess } from '../khepree/product-access-boundary';
import { getTranslationRecipeService } from './translation-recipe-service';
import { TranslateReadinessService } from './translate-readiness-service';
import { getJobService } from './job-service-singleton';
import {
  getCampaignPipelineOrchestrator,
  resetCampaignPipelineOrchestratorForTests,
} from '../campaign-pipeline/campaign-pipeline-orchestrator';
import type { TranslationCampaignProjectStatus } from '@shared/constants/translation-campaign';

export interface CampaignCapabilityLimits {
  maxProjects: number;
  maxConcurrentNovels: number;
  source: 'lease_override' | 'app_meta' | 'default';
}

export interface CampaignServiceOptions {
  /** Test override for capability limits. */
  limits?: Partial<CampaignCapabilityLimits>;
  /** Skip live provider readiness (unit tests). */
  skipProviderCheck?: boolean;
  readiness?: TranslateReadinessService;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class TranslationCampaignService {
  constructor(private readonly options: CampaignServiceOptions = {}) {}

  getCapabilityLimits(): CampaignCapabilityLimits {
    if (this.options.limits?.maxProjects != null && this.options.limits.maxConcurrentNovels != null) {
      return {
        maxProjects: this.options.limits.maxProjects,
        maxConcurrentNovels: this.options.limits.maxConcurrentNovels,
        source: 'lease_override',
      };
    }
    const db = getDatabase();
    const fromMetaProjects = db.appMeta.get(CAMPAIGN_APP_META_LIMIT_KEYS.maxProjects);
    const fromMetaConcurrent = db.appMeta.get(CAMPAIGN_APP_META_LIMIT_KEYS.maxConcurrentNovels);
    // Capability keys documented for lease → app_meta bridge (no plan names/prices).
    void CAMPAIGN_CAPABILITY_KEYS;
    const maxProjects = fromMetaProjects
      ? Number.parseInt(fromMetaProjects, 10)
      : CAMPAIGN_DEFAULT_LIMITS.maxProjects;
    const maxConcurrentNovels = fromMetaConcurrent
      ? Number.parseInt(fromMetaConcurrent, 10)
      : CAMPAIGN_DEFAULT_LIMITS.maxConcurrentNovels;
    return {
      maxProjects:
        Number.isFinite(maxProjects) && maxProjects > 0
          ? maxProjects
          : CAMPAIGN_DEFAULT_LIMITS.maxProjects,
      maxConcurrentNovels:
        Number.isFinite(maxConcurrentNovels) && maxConcurrentNovels > 0
          ? maxConcurrentNovels
          : CAMPAIGN_DEFAULT_LIMITS.maxConcurrentNovels,
      source: fromMetaProjects || fromMetaConcurrent ? 'app_meta' : 'default',
    };
  }

  async create(input: {
    title: string;
    recipeId: string;
    projectIds?: string[];
  }): Promise<CampaignPlanDto> {
    const recipe = getTranslationRecipeService().createCampaign({
      title: input.title,
      recipeId: input.recipeId,
    });
    const ids = [...new Set(input.projectIds ?? [])];
    for (const projectId of ids) {
      this.addProjectInternal(recipe.campaignId, projectId, { allowRunning: false });
    }
    return this.runPreflight(recipe.campaignId);
  }

  list(): CampaignListItemDto[] {
    const db = getDatabase();
    return db.translationCampaigns.list(200).map((row) => this.toListItem(row.id));
  }

  getDetail(campaignId: string): CampaignDetailDto {
    const db = getDatabase();
    const row = db.translationCampaigns.getById(campaignId);
    if (!row) throw new Error(`Campaign not found: ${campaignId}`);
    const snapshot = parseJson<{
      mode: CampaignPlanDto['recipeMode'];
      name: string;
    }>(row.recipe_snapshot_json);
    const plan =
      row.plan_json != null
        ? (parseJson<CampaignPlanDto>(row.plan_json) ?? this.buildPlanFromDb(campaignId))
        : this.buildPlanFromDb(campaignId);
    const projects = this.buildProjectRuntimes(campaignId, plan);
    const summary = this.summarizeProgress(projects, plan);
    const advanced = this.buildAdvancedStats(campaignId);

    return {
      campaignId: row.id,
      title: row.title,
      status: row.status as CampaignDetailDto['status'],
      recipeId: row.recipe_id,
      recipeMode: snapshot?.mode ?? plan.recipeMode ?? 'BALANCED',
      recipeName: snapshot?.name ?? plan.recipeName,
      startToken: row.start_token,
      startedAt: row.started_at,
      pausedAt: row.paused_at,
      completedAt: row.completed_at,
      lastError: row.last_error,
      projectCount: db.translationCampaigns.listProjects(campaignId).length,
      jobCount: db.translationCampaigns.listJobs(campaignId).length,
      progressPercent: summary.progressPercent,
      completedCount: summary.completedCount,
      runningCount: summary.runningCount,
      attentionCount: summary.attentionCount,
      estimatedMinutesMin: plan.estimate.estimatedMinutesMin,
      estimatedMinutesMax: plan.estimate.estimatedMinutesMax,
      estimateBasis: plan.estimate.estimateBasis,
      plan,
      projects,
      advanced,
    };
  }

  /**
   * Per-novel controls inside a campaign (priority / pause / resume / retry).
   * Cancel campaign itself never deletes translations — project pause only pauses jobs.
   */
  controlProject(input: {
    campaignId: string;
    projectId: string;
    action: 'pause' | 'resume' | 'retry' | 'setPriority';
    priority?: number;
  }): CampaignDetailDto {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(input.campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${input.campaignId}`);
    const link = db.translationCampaigns.getProjectLink(
      input.campaignId,
      input.projectId,
    );
    if (!link) throw new Error(`Project not in campaign: ${input.projectId}`);

    const jobLinks = db.translationCampaigns
      .listJobs(input.campaignId)
      .filter((j) => j.project_id === input.projectId);
    const jobs = getJobService();

    for (const jl of jobLinks) {
      const job = db.jobs.getById(jl.job_id);
      if (!job) continue;
      switch (input.action) {
        case 'pause':
          if (
            job.state === 'QUEUED' ||
            job.state === 'WAITING_WORKER' ||
            job.state === 'PAUSED'
          ) {
            db.jobs.updateState(jl.job_id, 'PAUSED', 'campaign_project_pause');
          }
          break;
        case 'resume':
          if (job.state === 'PAUSED') {
            db.jobs.updateState(jl.job_id, 'QUEUED');
          }
          break;
        case 'retry':
          try {
            jobs.retryFailed(jl.job_id);
          } catch {
            // skip non-retryable
          }
          break;
        case 'setPriority':
          if (typeof input.priority === 'number') {
            jobs.moveJob(jl.job_id, input.priority);
          }
          break;
        default:
          break;
      }
    }

    if (input.action === 'retry') {
      try {
        const orch = getCampaignPipelineOrchestrator(db, {
          skipBrowser: this.options.skipProviderCheck === true,
        });
        const runs = db.campaignPipeline
          .listRunsByCampaign(input.campaignId)
          .filter((r) => r.project_id === input.projectId);
        for (const run of runs) {
          if (
            run.status === 'FAILED_RETRYABLE' ||
            run.status === 'NEEDS_ATTENTION' ||
            run.status === 'FAILED_FINAL'
          ) {
            orch.retryStage(
              input.campaignId,
              input.projectId,
              run.current_stage,
            );
          }
        }
        void orch.tickCampaign(input.campaignId);
      } catch {
        // pipeline optional
      }
    }

    if (input.action === 'pause') {
      db.translationCampaigns.updateProject(input.campaignId, input.projectId, {
        status: 'PENDING',
      });
    }

    return this.getDetail(input.campaignId);
  }

  private toListItem(campaignId: string): CampaignListItemDto {
    const db = getDatabase();
    const row = db.translationCampaigns.getById(campaignId)!;
    const snapshot = parseJson<{
      mode: CampaignPlanDto['recipeMode'];
      name: string;
    }>(row.recipe_snapshot_json);
    const plan =
      row.plan_json != null
        ? parseJson<CampaignPlanDto>(row.plan_json)
        : null;
    const projects = plan
      ? this.buildProjectRuntimes(campaignId, plan)
      : this.buildProjectRuntimesFromLinks(campaignId);
    const summary = this.summarizeProgress(projects, plan);
    return {
      campaignId: row.id,
      title: row.title,
      status: row.status as CampaignListItemDto['status'],
      recipeId: row.recipe_id,
      recipeMode: snapshot?.mode ?? plan?.recipeMode ?? 'BALANCED',
      recipeName: snapshot?.name ?? plan?.recipeName ?? row.recipe_id,
      projectCount: db.translationCampaigns.listProjects(campaignId).length,
      progressPercent: summary.progressPercent,
      completedCount: summary.completedCount,
      runningCount: summary.runningCount,
      attentionCount: summary.attentionCount,
      estimatedMinutesMin: plan?.estimate.estimatedMinutesMin ?? null,
      estimatedMinutesMax: plan?.estimate.estimatedMinutesMax ?? null,
      estimateBasis: plan?.estimate.estimateBasis ?? 'insufficient_history',
      updatedAt: row.updated_at,
    };
  }

  private summarizeProgress(
    projects: CampaignProjectRuntimeDto[],
    plan: CampaignPlanDto | null,
  ): {
    progressPercent: number;
    completedCount: number;
    runningCount: number;
    attentionCount: number;
  } {
    const completedCount = projects.filter((p) => p.status === 'COMPLETED').length;
    const runningCount = projects.filter(
      (p) => p.status === 'RUNNING' || p.status === 'QUEUED',
    ).length;
    const attentionCount = projects.filter(
      (p) => p.status === 'NEEDS_ATTENTION' || p.status === 'FAILED',
    ).length;
    let progressPercent = 0;
    if (projects.length > 0) {
      progressPercent = Math.round(
        projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length,
      );
    } else if (plan && plan.estimate.projectCount > 0) {
      const done = plan.projects.filter(
        (p) => p.status === 'COMPLETED' || p.status === 'SKIPPED',
      ).length;
      progressPercent = Math.round((done / plan.estimate.projectCount) * 100);
    }
    return { progressPercent, completedCount, runningCount, attentionCount };
  }

  private buildProjectRuntimesFromLinks(
    campaignId: string,
  ): CampaignProjectRuntimeDto[] {
    const db = getDatabase();
    return db.translationCampaigns.listProjects(campaignId).map((link) => {
      const project = db.projects.getById(link.project_id);
      return {
        projectId: link.project_id,
        title: project?.title ?? link.project_id,
        status: link.status as TranslationCampaignProjectStatus,
        stage: null,
        progressPercent: link.status === 'COMPLETED' ? 100 : 0,
        providerShort: null,
        accountShort: null,
        estimatedMinutes: null,
        priority: 50,
        attentionCount: link.status === 'NEEDS_ATTENTION' || link.status === 'FAILED' ? 1 : 0,
        jobId: null,
        canPause: false,
        canRetry: link.status === 'FAILED' || link.status === 'NEEDS_ATTENTION',
      };
    });
  }

  private buildProjectRuntimes(
    campaignId: string,
    plan: CampaignPlanDto,
  ): CampaignProjectRuntimeDto[] {
    const db = getDatabase();
    const runs = db.campaignPipeline.listRunsByCampaign(campaignId);
    const runByProject = new Map<string, (typeof runs)[0]>();
    for (const run of runs) {
      const prev = runByProject.get(run.project_id);
      if (!prev || prev.updated_at < run.updated_at) {
        runByProject.set(run.project_id, run);
      }
    }
    const jobLinks = db.translationCampaigns.listJobs(campaignId);
    const jobsByProject = new Map<string, typeof jobLinks>();
    for (const jl of jobLinks) {
      const list = jobsByProject.get(jl.project_id) ?? [];
      list.push(jl);
      jobsByProject.set(jl.project_id, list);
    }

    const planById = new Map(plan.projects.map((p) => [p.projectId, p]));
    const links = db.translationCampaigns.listProjects(campaignId);
    const out: CampaignProjectRuntimeDto[] = [];

    for (const link of links) {
      const pf = planById.get(link.project_id);
      const project = db.projects.getById(link.project_id);
      const run = runByProject.get(link.project_id);
      const projectJobs = jobsByProject.get(link.project_id) ?? [];
      let primaryJob = null as ReturnType<typeof db.jobs.getById>;
      let priority = 50;
      for (const jl of projectJobs) {
        const job = db.jobs.getById(jl.job_id);
        if (!job) continue;
        if (!primaryJob || job.updated_at > primaryJob.updated_at) {
          primaryJob = job;
          priority = job.priority;
        }
      }

      let status = (link.status || pf?.status || 'PENDING') as TranslationCampaignProjectStatus;
      if (run) {
        if (run.status === 'COMPLETED') status = 'COMPLETED';
        else if (run.status === 'CANCELLED') status = 'CANCELLED';
        else if (run.status === 'RUNNING' || run.status === 'PENDING') status = 'RUNNING';
        else if (run.status === 'PAUSED') status = 'QUEUED';
        else if (
          run.status === 'NEEDS_ATTENTION' ||
          run.status === 'FAILED_RETRYABLE' ||
          run.status === 'FAILED_FINAL'
        ) {
          status = run.status === 'FAILED_FINAL' ? 'FAILED' : 'NEEDS_ATTENTION';
        } else if (run.status === 'SKIPPED') status = 'SKIPPED';
      } else if (primaryJob) {
        if (primaryJob.state === 'COMPLETED' || primaryJob.state === 'ACCEPTED_WITH_WARNINGS') {
          status = 'COMPLETED';
        } else if (primaryJob.state === 'NEEDS_ATTENTION') status = 'NEEDS_ATTENTION';
        else if (primaryJob.state === 'FAILED') status = 'FAILED';
        else if (primaryJob.state === 'PAUSED') status = 'QUEUED';
        else if (
          ['QUEUED', 'WAITING_WORKER', 'PREPARING', 'RUNNING', 'SENDING', 'WAITING_AI', 'PARSING', 'QA', 'REPAIRING'].includes(
            primaryJob.state,
          )
        ) {
          status = primaryJob.state === 'QUEUED' || primaryJob.state === 'WAITING_WORKER' ? 'QUEUED' : 'RUNNING';
        }
      }

      const chapterProgress =
        pf && pf.chaptersTotal > 0
          ? Math.round((pf.chaptersTranslated / pf.chaptersTotal) * 100)
          : null;
      const stageProgress = campaignStageProgressPercent(run?.current_stage);
      const progressPercent =
        status === 'COMPLETED' || status === 'SKIPPED'
          ? 100
          : Math.max(chapterProgress ?? 0, stageProgress);

      const attentionCount =
        (status === 'NEEDS_ATTENTION' || status === 'FAILED' ? 1 : 0) +
        (pf?.blockerCode ? 1 : 0);

      out.push({
        projectId: link.project_id,
        title: pf?.title ?? project?.title ?? link.project_id,
        status,
        stage: run?.current_stage ?? null,
        progressPercent,
        providerShort: shortenProviderLabel(primaryJob?.execution_provider_type),
        accountShort: shortenAccountLabel(
          primaryJob?.execution_account_id
            ? db.aiAccounts.getById(primaryJob.execution_account_id)?.google_email ??
                db.aiAccounts.getById(primaryJob.execution_account_id)?.display_name ??
                db.googleAccounts.getById(primaryJob.execution_account_id)?.email ??
                primaryJob.execution_account_id
            : null,
        ),
        estimatedMinutes: pf?.estimatedMinutes ?? null,
        priority,
        attentionCount,
        jobId: primaryJob?.id ?? null,
        canPause: Boolean(
          primaryJob &&
            ['QUEUED', 'WAITING_WORKER', 'PAUSED'].includes(primaryJob.state),
        ),
        canRetry: Boolean(
          primaryJob &&
            ['FAILED', 'NEEDS_ATTENTION', 'CANCELLED', 'SKIPPED'].includes(
              primaryJob.state,
            ),
        ) ||
          Boolean(
            run &&
              ['FAILED_RETRYABLE', 'NEEDS_ATTENTION', 'FAILED_FINAL'].includes(
                run.status,
              ),
          ),
      });
    }
    return out;
  }

  private buildAdvancedStats(campaignId: string): CampaignDetailDto['advanced'] {
    const db = getDatabase();
    try {
      const aiAccounts = db.aiAccounts.listAll();
      const google = db.googleAccounts.list();
      const accountsTotal = aiAccounts.length + google.length;
      const accountsReady =
        aiAccounts.filter((a) => {
          const s = (a.status ?? '').toUpperCase();
          return s === 'READY' || s === 'ACTIVE' || s === 'BUSY';
        }).length +
        google.filter((a) => {
          const s = (a.status ?? '').toUpperCase();
          return s === 'READY' || s === 'ACTIVE' || s === 'BUSY';
        }).length;
      const jobIds = db.translationCampaigns.listJobIds(campaignId);
      let jobsInFlight = 0;
      for (const id of jobIds) {
        const job = db.jobs.getById(id);
        if (
          job &&
          [
            'PREPARING',
            'WAITING_WORKER',
            'SENDING',
            'WAITING_AI',
            'RUNNING',
            'PARSING',
            'QA',
            'REPAIRING',
          ].includes(job.state)
        ) {
          jobsInFlight += 1;
        }
      }
      return {
        accountsReady,
        accountsTotal,
        jobsInFlight,
        maxConcurrent: this.getCapabilityLimits().maxConcurrentNovels,
      };
    } catch {
      return null;
    }
  }

  async addProjects(campaignId: string, projectIds: string[]): Promise<CampaignPlanDto> {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    const unique = [...new Set(projectIds)];
    for (const projectId of unique) {
      this.addProjectInternal(campaignId, projectId, {
        allowRunning: campaign.status === 'RUNNING' || campaign.status === 'PAUSED',
      });
    }
    if (campaign.status === 'DRAFT' || campaign.status === 'READY' || campaign.status === 'PREFLIGHT') {
      return this.runPreflight(campaignId);
    }
    return this.buildPlanFromDb(campaignId);
  }

  async removeProject(campaignId: string, projectId: string): Promise<CampaignPlanDto> {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (campaign.status !== 'DRAFT' && campaign.status !== 'READY' && campaign.status !== 'PREFLIGHT') {
      throw new Error('Can only remove projects from DRAFT/READY campaigns');
    }
    db.translationCampaigns.removeProject(campaignId, projectId);
    return this.runPreflight(campaignId);
  }

  async setProjectOverride(
    campaignId: string,
    projectId: string,
    override: TranslationRecipeOverrideDto | null,
  ): Promise<CampaignPlanDto> {
    getTranslationRecipeService().setCampaignProjectOverride({
      campaignId,
      projectId,
      override,
    });
    const campaign = getDatabase().translationCampaigns.getById(campaignId);
    if (campaign && (campaign.status === 'DRAFT' || campaign.status === 'READY' || campaign.status === 'PREFLIGHT')) {
      return this.runPreflight(campaignId);
    }
    return this.buildPlanFromDb(campaignId);
  }

  async runPreflight(campaignId: string): Promise<CampaignPlanDto> {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (
      campaign.status === 'RUNNING' ||
      campaign.status === 'STARTING' ||
      campaign.status === 'PAUSED'
    ) {
      return this.buildPlanFromDb(campaignId);
    }

    db.translationCampaigns.updateCampaign(campaignId, { status: 'PREFLIGHT' });
    const limits = this.getCapabilityLimits();
    const links = db.translationCampaigns.listProjects(campaignId);
    if (links.length > limits.maxProjects) {
      throw new Error(
        `Campaign exceeds capability ${CAMPAIGN_CAPABILITY_KEYS.maxProjects}=${limits.maxProjects}`,
      );
    }

    const projects: CampaignProjectPreflightDto[] = [];
    for (const link of links) {
      const preflight = await this.preflightProject(campaignId, link.project_id);
      db.translationCampaigns.updateProject(campaignId, link.project_id, {
        status: preflight.status,
        selected: link.selected === 1,
        preflightJson: JSON.stringify(preflight),
        blockerCode: preflight.blockerCode,
      });
      projects.push({ ...preflight, selected: link.selected === 1 });
    }

    const plan = this.assemblePlan(campaignId, projects);
    const nextStatus =
      plan.canStart || plan.estimate.runnableCount > 0 ? 'READY' : 'DRAFT';
    const finalPlan = { ...plan, status: nextStatus as CampaignPlanDto['status'] };
    db.translationCampaigns.updateCampaign(campaignId, {
      status: nextStatus,
      planJson: JSON.stringify(finalPlan),
      lastError: finalPlan.startBlockedReason,
    });
    return finalPlan;
  }

  async start(campaignId: string, startToken: string): Promise<CampaignStartResultDto> {
    assertKhepreeProductAccess(KHEPREE_FEATURES.translation);
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

    // Idempotent replay: same token while already started
    if (
      campaign.start_token === startToken &&
      (campaign.status === 'RUNNING' ||
        campaign.status === 'STARTING' ||
        campaign.status === 'PAUSED' ||
        campaign.status === 'COMPLETED')
    ) {
      const plan = this.buildPlanFromDb(campaignId);
      return {
        campaignId,
        status: campaign.status,
        idempotentReplay: true,
        jobsCreated: 0,
        jobsReused: db.translationCampaigns.listJobs(campaignId).length,
        projectsStarted: plan.estimate.runnableCount,
        projectsSkipped: plan.estimate.needsAttentionCount,
        plan,
      };
    }

    if (campaign.status === 'RUNNING' || campaign.status === 'STARTING') {
      // Different token while running — do not create duplicate jobs
      const plan = this.buildPlanFromDb(campaignId);
      return {
        campaignId,
        status: campaign.status,
        idempotentReplay: true,
        jobsCreated: 0,
        jobsReused: db.translationCampaigns.listJobs(campaignId).length,
        projectsStarted: plan.estimate.runnableCount,
        projectsSkipped: plan.estimate.needsAttentionCount,
        plan,
      };
    }

    if (campaign.status === 'CANCELLED') {
      throw new Error('Cancelled campaign cannot be started');
    }

    let plan =
      campaign.status === 'READY' && campaign.plan_json
        ? parseJson<CampaignPlanDto>(campaign.plan_json)
        : null;
    if (!plan) {
      plan = await this.runPreflight(campaignId);
    }
    if (!plan.canStart && plan.estimate.runnableCount === 0) {
      throw new Error(plan.startBlockedReason ?? 'No runnable projects in campaign');
    }

    // Scheduler enforces concurrent novels; pipeline starts up to capability max.
    const limits = this.getCapabilityLimits();
    db.translationCampaigns.updateCampaign(campaignId, {
      status: 'STARTING',
      startToken,
      startedAt: campaign.started_at ?? utcNow(),
      lastError: null,
    });

    const runnable = plan.projects.filter(
      (p) =>
        p.selected &&
        p.status !== 'NEEDS_ATTENTION' &&
        p.status !== 'SKIPPED' &&
        p.status !== 'FAILED',
    );
    const skippedProjects = plan.projects.filter(
      (p) =>
        !p.selected ||
        p.status === 'NEEDS_ATTENTION' ||
        p.status === 'SKIPPED' ||
        p.status === 'FAILED',
    );
    for (const p of skippedProjects) {
      if (p.status === 'NEEDS_ATTENTION') continue;
      db.translationCampaigns.updateProject(campaignId, p.projectId, {
        status: 'SKIPPED',
      });
    }

    const toStart = runnable.slice(0, limits.maxConcurrentNovels);
    const waiting = runnable.slice(limits.maxConcurrentNovels);
    for (const p of waiting) {
      db.translationCampaigns.updateProject(campaignId, p.projectId, {
        status: 'READY',
      });
    }

    const jobsBefore = db.translationCampaigns.listJobs(campaignId).length;
    const orchestrator = getCampaignPipelineOrchestrator(db, {
      skipBrowser: this.options.skipProviderCheck === true,
    });
    orchestrator.bootstrapRuns({
      campaignId,
      startToken,
      recipeMode: plan.recipeMode,
      projectIds: toStart.map((p) => p.projectId),
    });

    // Advance stages automatically — no manual approval between stages.
    await orchestrator.tickCampaign(campaignId);

    const jobsAfter = db.translationCampaigns.listJobs(campaignId).length;
    const jobsCreated = Math.max(0, jobsAfter - jobsBefore);
    const jobsReused = Math.max(0, jobsBefore);
    const projectsStarted = toStart.length;
    const projectsSkipped = skippedProjects.length;

    this.writeAudit('translation_started', campaignId, 'Campaign started', {
      clientStartId: startToken,
      jobsCreated,
      projectsStarted,
      pipeline: true,
    });

    db.translationCampaigns.updateCampaign(campaignId, {
      status: 'RUNNING',
      startToken,
      startedAt: campaign.started_at ?? utcNow(),
    });
    orchestrator.reconcileCampaignStatus(campaignId);

    const finalCampaign = db.translationCampaigns.getById(campaignId)!;
    const finalPlan = this.buildPlanFromDb(campaignId);
    db.translationCampaigns.updateCampaign(campaignId, {
      planJson: JSON.stringify(finalPlan),
    });

    return {
      campaignId,
      status: finalCampaign.status,
      idempotentReplay: false,
      jobsCreated,
      jobsReused,
      projectsStarted,
      projectsSkipped,
      plan: finalPlan,
    };
  }

  pause(campaignId: string): CampaignPlanDto {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (campaign.status !== 'RUNNING' && campaign.status !== 'STARTING') {
      return this.buildPlanFromDb(campaignId);
    }
    const jobIds = db.translationCampaigns.listJobIds(campaignId);
    for (const jobId of jobIds) {
      const job = db.jobs.getById(jobId);
      if (!job) continue;
      if (job.state === 'QUEUED' || job.state === 'WAITING_WORKER') {
        db.jobs.updateState(jobId, 'PAUSED', 'campaign_pause');
      }
    }
    getCampaignPipelineOrchestrator(db).pauseRuns(campaignId);
    db.translationCampaigns.updateCampaign(campaignId, {
      status: 'PAUSED',
      pausedAt: utcNow(),
    });
    this.writeAudit('export', campaignId, 'Campaign paused', { action: 'pause' });
    return this.buildPlanFromDb(campaignId);
  }

  resume(campaignId: string): CampaignPlanDto {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (campaign.status !== 'PAUSED') {
      return this.buildPlanFromDb(campaignId);
    }
    const jobIds = db.translationCampaigns.listJobIds(campaignId);
    for (const jobId of jobIds) {
      const job = db.jobs.getById(jobId);
      if (job?.state === 'PAUSED') {
        db.jobs.updateState(jobId, 'QUEUED');
      }
    }
    const orchestrator = getCampaignPipelineOrchestrator(db, {
      skipBrowser: this.options.skipProviderCheck === true,
    });
    orchestrator.resumeRuns(campaignId);
    db.translationCampaigns.updateCampaign(campaignId, {
      status: 'RUNNING',
      pausedAt: null,
    });
    void orchestrator.tickCampaign(campaignId);
    this.writeAudit('translation_started', campaignId, 'Campaign resumed', {
      action: 'resume',
    });
    return this.buildPlanFromDb(campaignId);
  }

  /** Operator: retry a failed stage (new attempt; side effects stay once). */
  retryPipelineStage(
    campaignId: string,
    projectId: string,
    stage: import('@shared/constants/campaign-pipeline').CampaignPipelineStage,
  ): CampaignPlanDto {
    const db = getDatabase();
    const orch = getCampaignPipelineOrchestrator(db, {
      skipBrowser: this.options.skipProviderCheck === true,
    });
    orch.retryStage(campaignId, projectId, stage);
    void orch.tickCampaign(campaignId);
    return this.buildPlanFromDb(campaignId);
  }

  skipPipelineStage(
    campaignId: string,
    projectId: string,
    stage: import('@shared/constants/campaign-pipeline').CampaignPipelineStage,
  ): CampaignPlanDto {
    const db = getDatabase();
    const orch = getCampaignPipelineOrchestrator(db, {
      skipBrowser: this.options.skipProviderCheck === true,
    });
    orch.skipStage(campaignId, projectId, stage);
    void orch.tickCampaign(campaignId);
    return this.buildPlanFromDb(campaignId);
  }

  restartPipelineFromStage(
    campaignId: string,
    projectId: string,
    stage: import('@shared/constants/campaign-pipeline').CampaignPipelineStage,
  ): CampaignPlanDto {
    const db = getDatabase();
    const orch = getCampaignPipelineOrchestrator(db, {
      skipBrowser: this.options.skipProviderCheck === true,
    });
    orch.restartFromStage(campaignId, projectId, stage);
    void orch.tickCampaign(campaignId);
    return this.buildPlanFromDb(campaignId);
  }

  cancel(campaignId: string): CampaignPlanDto {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    getCampaignPipelineOrchestrator(db).cancelRuns(campaignId);
    const jobIds = db.translationCampaigns.listJobIds(campaignId);
    for (const jobId of jobIds) {
      const job = db.jobs.getById(jobId);
      if (!job) continue;
      if (
        !['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED', 'ACCEPTED_WITH_WARNINGS'].includes(
          job.state,
        )
      ) {
        db.jobs.updateState(jobId, 'CANCELLED', 'campaign_cancel');
        db.jobs.releaseLease(jobId);
      }
    }
    for (const link of db.translationCampaigns.listProjects(campaignId)) {
      if (
        !['COMPLETED', 'SKIPPED', 'CANCELLED', 'FAILED'].includes(link.status)
      ) {
        db.translationCampaigns.updateProject(campaignId, link.project_id, {
          status: 'CANCELLED',
        });
      }
    }
    db.translationCampaigns.updateCampaign(campaignId, {
      status: 'CANCELLED',
      completedAt: utcNow(),
      lastError: null,
    });
    this.writeAudit('export', campaignId, 'Campaign cancelled (translations kept)', {
      action: 'cancel',
    });
    return this.buildPlanFromDb(campaignId);
  }

  private addProjectInternal(
    campaignId: string,
    projectId: string,
    opts: { allowRunning: boolean },
  ): void {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (!db.projects.getById(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const limits = this.getCapabilityLimits();
    const existingCount = db.translationCampaigns.listProjects(campaignId).length;
    const link = db.translationCampaigns.getProjectLink(campaignId, projectId);
    if (link) return; // duplicate — idempotent no-op

    if (
      campaign.status !== 'DRAFT' &&
      campaign.status !== 'READY' &&
      campaign.status !== 'PREFLIGHT'
    ) {
      if (!opts.allowRunning) {
        throw new Error('Can only add projects to DRAFT/READY campaigns');
      }
      // RUNNING/PAUSED: explicit rule + audit
      if (existingCount >= limits.maxProjects) {
        throw new Error(
          `Capability limit ${CAMPAIGN_CAPABILITY_KEYS.maxProjects}=${limits.maxProjects}`,
        );
      }
      db.translationCampaigns.addOrGetProject({ campaignId, projectId });
      this.writeAudit('export', campaignId, 'Project added to running campaign', {
        action: 'add_project_running',
        projectId,
      });
      return;
    }

    if (existingCount >= limits.maxProjects) {
      throw new Error(
        `Capability limit ${CAMPAIGN_CAPABILITY_KEYS.maxProjects}=${limits.maxProjects}`,
      );
    }
    db.translationCampaigns.addOrGetProject({ campaignId, projectId });
  }

  private async preflightProject(
    campaignId: string,
    projectId: string,
  ): Promise<CampaignProjectPreflightDto> {
    const db = getDatabase();
    const project = db.projects.getById(projectId);
    if (!project || project.deleted_at) {
      return this.blockedProject(projectId, 'Missing project', 'PROJECT_MISSING');
    }

    const chapters = db.chapters.listByProject(projectId);
    const editionId = project.active_edition_id;
    let chaptersTranslated = 0;
    let chaptersUntranslated = 0;
    let chaptersHumanLocked = 0;
    let chaptersSourceConflict = 0;
    let chaptersSourceError = 0;
    let approximateCharsRemaining = 0;

    for (const ch of chapters) {
      if (ch.chapter_number == null || ch.chapter_number <= 0) continue;
      if (ch.source_status === 'SOURCE_CONFLICT') chaptersSourceConflict += 1;
      if (ch.source_status === 'SOURCE_ERROR' || ch.source_status === 'SOURCE_MISSING') {
        chaptersSourceError += 1;
      }
      const paras = db.paragraphs.listByChapter(ch.id);
      let translated = 0;
      let locked = 0;
      let remainingChars = 0;
      for (const para of paras) {
        const tr = db.translations.getByParagraphId(para.id, editionId);
        if (tr?.human_locked === 1) locked += 1;
        if (tr?.translated_text && tr.translated_text.trim()) {
          translated += 1;
        } else {
          remainingChars += para.source_text?.length ?? 0;
        }
      }
      chaptersHumanLocked += locked > 0 ? 1 : 0;
      if (paras.length > 0 && translated === paras.length) {
        chaptersTranslated += 1;
      } else if (ch.source_status === 'SOURCE_READY' || !ch.source_status) {
        chaptersUntranslated += 1;
        approximateCharsRemaining += remainingChars;
      }
    }

    let providerReady = true;
    let providerMessage: string | null = null;
    if (!this.options.skipProviderCheck) {
      try {
        const readiness =
          this.options.readiness ?? new TranslateReadinessService(db);
        const result = await readiness.ensureForTranslate(projectId);
        providerReady = result.ok;
        providerMessage = result.ok ? null : result.message;
      } catch (err: unknown) {
        providerReady = false;
        providerMessage = err instanceof Error ? err.message : String(err);
      }
    }

    const recipe = getTranslationRecipeService().resolveForProject(projectId, {
      campaignId,
    });
    const relativeEffortUnits =
      chaptersUntranslated * CAMPAIGN_EFFORT_WEIGHTS.chapterBase +
      (approximateCharsRemaining / 1000) * CAMPAIGN_EFFORT_WEIGHTS.charPerThousand +
      chaptersUntranslated *
        recipe.config.maxRepairAttempts *
        CAMPAIGN_EFFORT_WEIGHTS.repairRound +
      (recipe.config.wholeBookAudit ? CAMPAIGN_EFFORT_WEIGHTS.publicationAudit : 0);

    let blockerCode: CampaignBlockerCode | null = null;
    let blockerMessage: string | null = null;
    let status: CampaignProjectPreflightDto['status'] = 'READY';

    if (chapters.length === 0) {
      blockerCode = 'NO_CHAPTERS';
      blockerMessage = 'Project has no chapters';
      status = 'NEEDS_ATTENTION';
    } else if (chaptersSourceConflict > 0) {
      blockerCode = 'SOURCE_CONFLICT';
      blockerMessage = `${chaptersSourceConflict} chapter(s) have source conflicts`;
      status = 'NEEDS_ATTENTION';
    } else if (chaptersUntranslated === 0 && chaptersTranslated > 0) {
      blockerCode = 'ALL_TRANSLATED';
      blockerMessage = 'All chapters already translated (or locked)';
      status = 'SKIPPED';
    } else if (!providerReady) {
      blockerCode = 'PROVIDER_NOT_READY';
      blockerMessage = providerMessage ?? 'Provider / account not ready';
      status = 'NEEDS_ATTENTION';
    }

    const historyMinutes = this.estimateMinutesFromHistory(projectId, relativeEffortUnits);

    return {
      projectId,
      title: project.title,
      status,
      selected: true,
      blockerCode,
      blockerMessage,
      chaptersTotal: chapters.filter((c) => (c.chapter_number ?? 0) > 0).length,
      chaptersUntranslated,
      chaptersTranslated,
      chaptersHumanLocked,
      chaptersSourceConflict,
      chaptersSourceError,
      approximateCharsRemaining,
      providerReady,
      providerMessage,
      relativeEffortUnits: Math.round(relativeEffortUnits * 10) / 10,
      estimatedMinutes: historyMinutes,
    };
  }

  private blockedProject(
    projectId: string,
    message: string,
    code: CampaignBlockerCode,
  ): CampaignProjectPreflightDto {
    return {
      projectId,
      title: projectId,
      status: 'NEEDS_ATTENTION',
      selected: false,
      blockerCode: code,
      blockerMessage: message,
      chaptersTotal: 0,
      chaptersUntranslated: 0,
      chaptersTranslated: 0,
      chaptersHumanLocked: 0,
      chaptersSourceConflict: 0,
      chaptersSourceError: 0,
      approximateCharsRemaining: 0,
      providerReady: false,
      providerMessage: message,
      relativeEffortUnits: 0,
      estimatedMinutes: null,
    };
  }

  private estimateMinutesFromHistory(
    projectId: string,
    effortUnits: number,
  ): number | null {
    const db = getDatabase();
    const jobs = db.jobs
      .listByProject(projectId)
      .filter((j) => j.state === 'COMPLETED' && j.started_at && j.completed_at)
      .slice(0, 20);
    if (jobs.length < 3) return null;
    const durations: number[] = [];
    for (const job of jobs) {
      const start = Date.parse(job.started_at!);
      const end = Date.parse(job.completed_at!);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        durations.push((end - start) / 60000);
      }
    }
    if (durations.length < 3) return null;
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    // Scale by relative effort vs one "typical" chapter job (~1 unit)
    return Math.max(1, Math.round(avg * Math.max(effortUnits, 0.5)));
  }

  private assemblePlan(
    campaignId: string,
    projects: CampaignProjectPreflightDto[],
  ): CampaignPlanDto {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId)!;
    const snapshot = parseJson<{
      mode: CampaignPlanDto['recipeMode'];
      name: string;
      recipeId: string;
      config?: TranslationRecipeConfig;
    }>(campaign.recipe_snapshot_json);
    const limits = this.getCapabilityLimits();
    const runnable = projects.filter((p) => p.selected && p.status === 'READY');
    const needsAttention = projects.filter((p) => p.status === 'NEEDS_ATTENTION');
    const chaptersToTranslate = runnable.reduce((s, p) => s + p.chaptersUntranslated, 0);
    const approximateChars = runnable.reduce((s, p) => s + p.approximateCharsRemaining, 0);
    const relativeProcessingRounds = runnable.reduce((s, p) => s + p.relativeEffortUnits, 0);
    const withEstimates = runnable
      .map((p) => p.estimatedMinutes)
      .filter((n): n is number => n != null);
    const estimateBasis =
      withEstimates.length >= Math.max(1, Math.ceil(runnable.length / 2))
        ? 'local_history'
        : 'insufficient_history';
    const estimatedMinutesMin =
      estimateBasis === 'local_history' ? Math.min(...withEstimates) : null;
    const estimatedMinutesMax =
      estimateBasis === 'local_history'
        ? Math.round(withEstimates.reduce((a, b) => a + b, 0))
        : null;

    let canStart = runnable.length > 0;
    let startBlockedReason: string | null = null;
    if (projects.length === 0) {
      canStart = false;
      startBlockedReason = 'Add at least one project';
    } else if (runnable.length === 0) {
      canStart = false;
      startBlockedReason = 'All projects need attention or are already translated';
    } else if (projects.length > limits.maxProjects) {
      canStart = false;
      startBlockedReason = `Exceeds ${CAMPAIGN_CAPABILITY_KEYS.maxProjects} (${limits.maxProjects})`;
    }

    return {
      campaignId,
      title: campaign.title,
      status: campaign.status,
      recipeId: snapshot?.recipeId ?? campaign.recipe_id,
      recipeMode: snapshot?.mode ?? 'BALANCED',
      recipeName: snapshot?.name ?? campaign.recipe_id,
      projects,
      estimate: {
        projectCount: projects.length,
        runnableCount: runnable.length,
        needsAttentionCount: needsAttention.length,
        chaptersToTranslate,
        approximateChars,
        relativeProcessingRounds: Math.round(relativeProcessingRounds * 10) / 10,
        estimatedMinutesMin,
        estimatedMinutesMax,
        estimateBasis,
        capabilityMaxProjects: limits.maxProjects,
        capabilityMaxConcurrentNovels: limits.maxConcurrentNovels,
      },
      canStart,
      startBlockedReason,
      updatedAt: utcNow(),
    };
  }

  private buildPlanFromDb(campaignId: string): CampaignPlanDto {
    const db = getDatabase();
    const campaign = db.translationCampaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    if (campaign.plan_json) {
      const cached = parseJson<CampaignPlanDto>(campaign.plan_json);
      if (cached) {
        return { ...cached, status: campaign.status, updatedAt: campaign.updated_at };
      }
    }
    const projects: CampaignProjectPreflightDto[] = [];
    for (const link of db.translationCampaigns.listProjects(campaignId)) {
      const pf = parseJson<CampaignProjectPreflightDto>(link.preflight_json);
      if (pf) {
        projects.push({
          ...pf,
          selected: link.selected === 1,
          status: link.status,
          blockerCode: (link.blocker_code as CampaignBlockerCode | null) ?? pf.blockerCode,
        });
      } else {
        const project = db.projects.getById(link.project_id);
        projects.push({
          projectId: link.project_id,
          title: project?.title ?? link.project_id,
          status: link.status,
          selected: link.selected === 1,
          blockerCode: (link.blocker_code as CampaignBlockerCode | null) ?? null,
          blockerMessage: null,
          chaptersTotal: 0,
          chaptersUntranslated: 0,
          chaptersTranslated: 0,
          chaptersHumanLocked: 0,
          chaptersSourceConflict: 0,
          chaptersSourceError: 0,
          approximateCharsRemaining: 0,
          providerReady: true,
          providerMessage: null,
          relativeEffortUnits: 0,
          estimatedMinutes: null,
        });
      }
    }
    return this.assemblePlan(campaignId, projects);
  }

  private writeAudit(
    eventType: 'translation_started' | 'export',
    campaignId: string,
    summary: string,
    metadata: Record<string, unknown>,
  ): void {
    try {
      getDatabase().auditLog.append({
        eventType,
        summary,
        resourceType: 'translation_campaign',
        resourceId: campaignId,
        metadata,
      });
    } catch {
      // audit optional
    }
  }
}

let campaignService: TranslationCampaignService | null = null;

export function getTranslationCampaignService(
  options?: CampaignServiceOptions,
): TranslationCampaignService {
  if (options) {
    return new TranslationCampaignService(options);
  }
  if (!campaignService) {
    campaignService = new TranslationCampaignService();
  }
  return campaignService;
}

export function resetTranslationCampaignServiceForTests(): void {
  campaignService = null;
  resetCampaignPipelineOrchestratorForTests();
}

export { newId as newCampaignStartTokenSource };
