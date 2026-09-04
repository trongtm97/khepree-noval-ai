import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { JobService } from '@main/services/job-service';
import { NotebookBindingService } from '@main/services/notebook-binding-service';
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
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';
import { handleTranslation } from '@main/campaign-pipeline/stage-handlers';
import { resolveTranslationNotebook } from '@main/notebook/notebook-resolver';
import { buildLibrarySearchRoute } from '@main/library-search/index-builder';
import {
  getLibrarySearchService,
  resetLibrarySearchServiceForTests,
} from '@main/library-search/library-search-service';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';
import { buildStageIdempotencyKey } from '@shared/constants/campaign-pipeline';
import { getBuiltinRecipe } from '@shared/constants/translation-recipe-defs';
import type { NotebookProvider } from '@main/automation/providers/google/notebook-provider';
import type { Page } from 'playwright';

/**
 * HARD REQUIREMENT 19 — automated acceptance matrix (TEST A–L).
 * Notebook ownership, reuse, series knowledge, library search navigation.
 */
describe('HR19 automated tests A–L', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-hr19-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetNotebookBindingServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetTranslationRecipeServiceForTests();
    resetJobServiceForTests();
    resetFictionSeriesServiceForTests();
    resetLibrarySearchServiceForTests();
  });

  afterEach(() => {
    resetLibrarySearchServiceForTests();
    resetFictionSeriesServiceForTests();
    resetJobServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetTranslationRecipeServiceForTests();
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const page = {
    url: () => 'https://notebook.google.com/',
    goto: async () => undefined,
  } as unknown as Page;

  function seedStory(title: string, chapterCount = 1) {
    const db = getDatabase();
    const project = db.projects.create({ title });
    ensureDefaultEdition(db, project.id);
    const chapters = [];
    for (let i = 1; i <= chapterCount; i += 1) {
      const chapter = db.chapters.create({
        project_id: project.id,
        chapter_number: i,
        sequence_order: i,
        source_text: `足够长的源文本用于排队翻译作业。章节${i}`,
        source_status: 'SOURCE_READY',
        chapter_title: `Chapter ${i}`,
      });
      db.paragraphs.create({
        chapter_id: chapter.id,
        paragraph_id: `[C${String(i).padStart(6, '0')}:P000001]`,
        sequence: 1,
        source_text: `足够长的源文本用于排队翻译作业。章节${i}`,
      });
      chapters.push(chapter);
    }
    const account = db.googleAccounts.create({
      label: `${title}-acct`,
      email: `${title.replace(/\s+/g, '').toLowerCase()}@test.com`,
      displayName: title,
      profileDirName: `profile-${title.replace(/\s+/g, '-').toLowerCase()}`,
    });
    return { db, project, chapters, account };
  }

  function bindStory(
    projectId: string,
    accountId: string,
    notebookId: string,
    name: string,
  ) {
    return getNotebookBindingService().persistBinding({
      projectId,
      accountId,
      notebookName: name,
      role: 'SINGLE',
      notebookId,
      notebookUrl: `https://notebook.google.com/n/${notebookId}`,
      status: 'ready',
      lastVerifiedAt: '2026-09-04T12:00:00.000Z',
    });
  }

  function reuseProvider(notebookId: string): NotebookProvider & {
    __ensure: ReturnType<typeof vi.fn>;
  } {
    const ensure = vi.fn(async (n: string) => ({
      name: n,
      id: 'should-not-create',
      url: 'https://notebook.google.com/n/should-not-create',
    }));
    return {
      findNotebookByName: async (name: string) => ({
        name,
        id: notebookId,
        url: `https://notebook.google.com/n/${notebookId}`,
      }),
      ensureNotebook: ensure,
      openNotebook: async (name: string) => ({
        name,
        id: notebookId,
        url: `https://notebook.google.com/n/${notebookId}`,
      }),
      __ensure: ensure,
    } as unknown as NotebookProvider & { __ensure: ReturnType<typeof vi.fn> };
  }

  // ——— TEST A ———
  it('TEST A: existing binding + translate new chapter does not create project', async () => {
    const { project, chapters, account } = seedStory('Story A', 2);
    bindStory(project.id, account.id, 'nb-A', '[Khepree] Story A');
    const provider = reuseProvider('nb-A');

    // Simulate translating chapter 2 (new chapter) after ch1 already bound.
    const result = await getNotebookBindingService().getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Story A',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('reused');
    expect(result.binding.notebookId).toBe('nb-A');
    expect(provider.__ensure).not.toHaveBeenCalled();

    const jobs = new JobService(getDatabase()).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapters[1]!.id],
      skipTranslated: true,
    });
    expect(jobs.jobs[0]!.projectId).toBe(project.id);
    expect(
      getNotebookBindingService().getNotebookForStory(project.id)?.notebookId,
    ).toBe('nb-A');
    expect(
      getDatabase()
        .notebooks.listByProject(project.id)
        .filter((r) => r.notebook_id && !r.deprecated_at),
    ).toHaveLength(1);
  });

  // ——— TEST B ———
  it('TEST B: batch of 10 chapters from one story uses exactly one Notebook', async () => {
    const { project, chapters, account } = seedStory('Batch Ten', 10);
    bindStory(project.id, account.id, 'nb-batch', '[Khepree] Batch Ten');
    const provider = reuseProvider('nb-batch');
    const svc = getNotebookBindingService();

    const results = await Promise.all(
      chapters.map(() =>
        svc.getOrCreateNotebookBinding({
          projectId: project.id,
          accountId: account.id,
          preferredName: '[Khepree] Batch Ten',
          role: 'SINGLE',
          provider,
          page,
        }),
      ),
    );

    expect(provider.__ensure).not.toHaveBeenCalled();
    expect(new Set(results.map((r) => r.binding.notebookId))).toEqual(
      new Set(['nb-batch']),
    );

    const enqueued = new JobService(getDatabase()).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: chapters.map((c) => c.id),
      skipTranslated: true,
    });
    expect(enqueued.jobs.length).toBeGreaterThan(0);
    for (const job of enqueued.jobs) {
      expect(
        svc.resolveNotebookForProductionJob(job.projectId)?.notebookId,
      ).toBe('nb-batch');
    }
    expect(
      getDatabase()
        .notebooks.listByProject(project.id)
        .filter((r) => r.notebook_id && !r.deprecated_at),
    ).toHaveLength(1);
  });

  // ——— TEST C ———
  it('TEST C: 5 concurrent jobs for same story → exactly one Notebook creation', async () => {
    const db = getDatabase();
    const { project, account } = seedStory('Race Story', 1);
    let ensureCalls = 0;
    let createStarted = 0;
    let releaseCreate: (() => void) | null = null;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });

    const makeProvider = (): NotebookProvider =>
      ({
        findNotebookByName: async (name: string) => {
          const bound = db.notebooks.getByProjectWorkerRole(
            project.id,
            account.id,
            'SINGLE',
          );
          if (bound?.notebook_id) {
            return {
              name: bound.notebook_name ?? name,
              id: bound.notebook_id,
              url: bound.resource_url!,
            };
          }
          return null;
        },
        ensureNotebook: async (name: string) => {
          ensureCalls += 1;
          createStarted += 1;
          if (createStarted === 1) await createGate;
          return {
            name,
            id: 'remote-only-one',
            url: 'https://notebook.google.com/n/remote-only-one',
          };
        },
        openNotebook: async (name: string) => ({
          name,
          id: 'remote-only-one',
          url: 'https://notebook.google.com/n/remote-only-one',
        }),
      }) as unknown as NotebookProvider;

    const svc = new NotebookBindingService(db);
    const starters = Array.from({ length: 5 }, () =>
      svc.getOrCreateNotebookBinding({
        projectId: project.id,
        accountId: account.id,
        preferredName: '[Khepree] Race Story',
        role: 'SINGLE',
        provider: makeProvider(),
        page,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(ensureCalls).toBe(1);
    releaseCreate!();
    const results = await Promise.all(starters);
    expect(ensureCalls).toBe(1);
    expect(results.filter((r) => r.outcome === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'reused')).toHaveLength(4);
    expect(new Set(results.map((r) => r.binding.notebookId))).toEqual(
      new Set(['remote-only-one']),
    );
  });

  // ——— TEST D ———
  it('TEST D: retry failed chapter reuses original Notebook', async () => {
    const { project, account } = seedStory('Retry Story', 1);
    bindStory(project.id, account.id, 'nb-retry', '[Khepree] Retry Story');
    const provider = reuseProvider('nb-retry');

    const result = await getNotebookBindingService().reuseNotebookBindingForRetry({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Retry Story',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('reused');
    expect(result.binding.notebookId).toBe('nb-retry');
    expect(provider.__ensure).not.toHaveBeenCalled();
  });

  // ——— TEST E ———
  it('TEST E: pause/resume campaign reuses original Notebook', async () => {
    const { project, account } = seedStory('Campaign Story', 1);
    bindStory(project.id, account.id, 'nb-campaign', '[Khepree] Campaign Story');

    const campaignSvc = getTranslationCampaignService({
      skipProviderCheck: true,
    });
    const plan = await campaignSvc.create({
      title: 'HR19 Campaign',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [project.id],
    });
    await campaignSvc.start(plan.campaignId, `hr19-e-${Date.now()}`);
    const paused = campaignSvc.pause(plan.campaignId);
    expect(paused.status).toBe('PAUSED');
    const resumed = campaignSvc.resume(plan.campaignId);
    expect(resumed.status).toBe('RUNNING');

    expect(
      getNotebookBindingService().getNotebookForStory(project.id)?.notebookId,
    ).toBe('nb-campaign');
    expect(
      getNotebookBindingService().resolveNotebookForProductionJob(project.id)
        ?.notebookId,
    ).toBe('nb-campaign');
    expect(
      getDatabase()
        .notebooks.listByProject(project.id)
        .filter((r) => r.notebook_id && !r.deprecated_at),
    ).toHaveLength(1);
  });

  // ——— TEST F ———
  it('TEST F: restart/reload restores and reuses Notebook binding', async () => {
    const { project, account } = seedStory('Persist Story', 1);
    bindStory(project.id, account.id, 'nb-persist', '[Khepree] Persist Story');

    resetNotebookBindingServiceForTests();
    const after = getNotebookBindingService().getNotebookForStory(project.id);
    expect(after?.notebookId).toBe('nb-persist');
    expect(after?.notebookUrl).toContain('nb-persist');

    const provider = reuseProvider('nb-persist');
    const reused = await getNotebookBindingService().getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Persist Story',
      role: 'SINGLE',
      provider,
      page,
    });
    expect(reused.outcome).toBe('reused');
    expect(reused.binding.notebookId).toBe('nb-persist');
    expect(provider.__ensure).not.toHaveBeenCalled();
  });

  // ——— TEST G ———
  it('TEST G: Production Center + Translate screen share same core + Notebook', async () => {
    const { db, project, chapters, account } = seedStory('Shared Core', 1);
    bindStory(project.id, account.id, 'nb-shared', '[Khepree] Shared Core');

    const translateJobs = new JobService(db).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapters[0]!.id],
      skipTranslated: true,
    });
    expect(translateJobs.jobs[0]!.projectId).toBe(project.id);

    const campaign = await getTranslationCampaignService({
      skipProviderCheck: true,
    }).create({
      title: 'PC Shared',
      recipeId: BUILTIN_RECIPE_IDS.QUICK,
      projectIds: [project.id],
    });
    const prodJobs = new JobService(db).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapters[0]!.id],
      campaignId: campaign.campaignId,
      skipTranslated: true,
    });
    expect(prodJobs.jobs[0]!.projectId).toBe(project.id);

    const svc = getNotebookBindingService();
    expect(svc.getNotebookForStory(project.id)?.notebookId).toBe('nb-shared');
    expect(
      svc.resolveNotebookForProductionJob(prodJobs.jobs[0]!.projectId)?.notebookId,
    ).toBe('nb-shared');
    expect(resolveTranslationNotebook(db, project.id, account.id)?.notebook_id).toBe(
      'nb-shared',
    );

    const startToken = `hr19-g-${Date.now()}`;
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
    const result = await handleTranslation({
      db,
      campaignId: campaign.campaignId,
      projectId: project.id,
      runId: run.id,
      stage: 'TRANSLATION',
      recipeMode: 'QUICK',
      recipeConfig: getBuiltinRecipe(BUILTIN_RECIPE_IDS.QUICK)!.config,
      startToken,
      attempt: 1,
      stageRow,
      skipBrowser: true,
    });
    expect(result.checkpoint?.notebookId).toBe('nb-shared');
  });

  // ——— TEST H ———
  it('TEST H: two different stories may have two different Notebook bindings', () => {
    const a = seedStory('Story One', 1);
    const b = seedStory('Story Two', 1);
    bindStory(a.project.id, a.account.id, 'nb-one', '[Khepree] Story One');
    bindStory(b.project.id, b.account.id, 'nb-two', '[Khepree] Story Two');

    const svc = getNotebookBindingService();
    expect(svc.getNotebookForStory(a.project.id)?.notebookId).toBe('nb-one');
    expect(svc.getNotebookForStory(b.project.id)?.notebookId).toBe('nb-two');
    expect(svc.getNotebookForStory(a.project.id)?.notebookId).not.toBe(
      svc.getNotebookForStory(b.project.id)?.notebookId,
    );
  });

  // ——— TEST I ———
  it('TEST I: series shares knowledge; notebook ownership stays per story', async () => {
    const db = getDatabase();
    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Shared World Series' });
    const vol1 = seedStory('Vol 1', 1);
    const vol2 = seedStory('Vol 2', 1);

    db.fictionSeries.setWorldKnowledgeJson(
      series.id,
      JSON.stringify({ 青云门: 'Thanh Vân Môn' }),
    );
    db.terms.create({
      source_text: '筑基',
      scope: 'SERIES',
      scope_ref: series.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Trúc Cơ',
      term_type: 'CULTIVATION_LEVEL',
    });
    seriesSvc.assignProjectToSeries({
      projectId: vol1.project.id,
      seriesId: series.id,
      force: true,
    });
    seriesSvc.assignProjectToSeries({
      projectId: vol2.project.id,
      seriesId: series.id,
      force: true,
    });

    bindStory(vol1.project.id, vol1.account.id, 'nb-vol1', '[Khepree] Vol 1');
    bindStory(vol2.project.id, vol2.account.id, 'nb-vol2', '[Khepree] Vol 2');

    const svc = getNotebookBindingService();
    expect(svc.getNotebookForStory(vol1.project.id)?.notebookId).toBe('nb-vol1');
    expect(svc.getNotebookForStory(vol2.project.id)?.notebookId).toBe('nb-vol2');
    expect(svc.getNotebookForStory(vol1.project.id)?.notebookId).not.toBe(
      svc.getNotebookForStory(vol2.project.id)?.notebookId,
    );

    // Series owner must not be used as notebook owner.
    expect(() =>
      svc.persistBinding({
        projectId: series.id,
        accountId: vol1.account.id,
        notebookName: 'series-owned',
        role: 'SINGLE',
        notebookId: 'nb-series-illegal',
      }),
    ).toThrow(/story\/projectId/i);

    expect(db.terms.listByScope('SERIES', series.id).some((t) => t.source_text === '筑基')).toBe(
      true,
    );
    expect(db.fictionSeries.getWorldState(series.id)?.world_knowledge_json).toContain(
      'Thanh Vân Môn',
    );
  });

  // ——— TEST J ———
  it('TEST J: broken Notebook/session → reconnect/relink, not silent create', async () => {
    const { project, account } = seedStory('Broken NB', 1);
    bindStory(project.id, account.id, 'nb-broken', '[Khepree] Broken NB');

    const ensure = vi.fn(async (name: string) => ({
      name,
      id: 'replacement-forbidden',
      url: 'https://notebook.google.com/n/replacement-forbidden',
    }));
    const provider = {
      findNotebookByName: async () => null,
      ensureNotebook: ensure,
      openNotebook: async () => {
        throw new Error('session expired / notebook inaccessible');
      },
    } as unknown as NotebookProvider;

    const result = await getNotebookBindingService().getOrCreateNotebookBinding({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Broken NB',
      role: 'SINGLE',
      provider,
      page,
    });

    expect(result.outcome).toBe('needs_reconnect');
    if (result.outcome !== 'needs_reconnect') return;
    expect(result.actions).toEqual([
      'retry_connect',
      'open_notebook',
      'relink_notebook',
    ]);
    expect(result.binding.notebookId).toBe('nb-broken');
    expect(ensure).not.toHaveBeenCalled();
  });

  // ——— TEST K ———
  it('TEST K: Library Search results include IDs and navigate to real entities', async () => {
    const db = getDatabase();
    const { project, chapters } = seedStory('Searchable Novel', 1);
    const chapter = chapters[0]!;
    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Searchable Series' });
    seriesSvc.assignProjectToSeries({
      projectId: project.id,
      seriesId: series.id,
      force: true,
    });
    db.fictionSeries.setWorldKnowledgeJson(
      series.id,
      JSON.stringify({ lore: 'Crystal Peak library lore' }),
    );

    const svc = getLibrarySearchService(db);
    await svc.startReindex(true);
    for (let i = 0; i < 80; i += 1) {
      const progress = svc.getReindexProgress();
      if (!progress || progress.status === 'COMPLETED' || progress.status === 'FAILED') {
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const projectHits = svc.query({ query: 'Searchable Novel', entityTypes: ['project'] });
    const projectItem = projectHits.items.find((i) => i.entityId === project.id);
    expect(projectItem?.entityId).toBe(project.id);
    expect(projectItem?.projectId).toBe(project.id);
    expect(projectItem?.route).toBe(`/projects/${project.id}`);

    const chapterHits = svc.query({
      query: 'Chapter 1',
      entityTypes: ['chapter'],
      projectIds: [project.id],
    });
    const chapterItem = chapterHits.items.find((i) => i.entityId === chapter.id);
    expect(chapterItem?.entityId).toBe(chapter.id);
    expect(chapterItem?.projectId).toBe(project.id);
    expect(chapterItem?.route).toContain(`/projects/${project.id}`);
    expect(chapterItem?.route).toMatch(/chapter|translate|chapters/i);

    const worldHits = svc.query({ query: 'Crystal Peak', entityTypes: ['world'] });
    const worldItem = worldHits.items.find((i) => i.entityId === series.id);
    expect(worldItem?.entityId).toBe(series.id);
    expect(worldItem?.route).toBe(`/series/${series.id}`);

    // Route builder contract for real entity navigation.
    expect(
      buildLibrarySearchRoute({
        entityType: 'project',
        entityId: project.id,
        projectId: project.id,
      }),
    ).toBe(`/projects/${project.id}`);
    expect(
      buildLibrarySearchRoute({
        entityType: 'series',
        entityId: series.id,
        projectId: null,
      }),
    ).toBe(`/series/${series.id}`);
  });

  // ——— TEST L ———
  it('TEST L: Series/World entity data consumed by translation-context path', async () => {
    const db = getDatabase();
    const { buildMemoryContext } = await import('@main/memory/context-selector');
    const { buildTranslationPack } = await import('@main/prompt/translation-pack-builder');
    const { toCharacterDto, toRelationshipDto } = await import('@main/services/memory-dto');
    const { resolveCharacterPreferredName } = await import('@main/memory/edition-memory');

    const seriesSvc = new FictionSeriesService(() => db);
    const series = seriesSvc.createSeries({ title: 'Ctx Series HR19' });
    const vol1 = seedStory('Ctx Vol 1', 1);
    const vol2 = seedStory('Ctx Vol 2', 1);
    const edition2 = ensureDefaultEdition(db, vol2.project.id).id;

    db.fictionSeries.upsertStyleRule({
      seriesId: series.id,
      ruleKind: 'naming',
      content: 'Keep sect titles untranslated on first mention',
      sortOrder: 0,
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
    db.characters.create({
      project_id: vol1.project.id,
      canonical_name: '张小凡',
      translated_name: 'Trương Tiểu Phàm',
      first_chapter: 1,
    });
    seriesSvc.assignProjectToSeries({
      projectId: vol1.project.id,
      seriesId: series.id,
      force: true,
    });
    seriesSvc.assignProjectToSeries({
      projectId: vol2.project.id,
      seriesId: series.id,
      force: true,
    });

    // Per-story notebooks remain distinct while series knowledge is shared.
    bindStory(vol1.project.id, vol1.account.id, 'nb-ctx-1', '[Khepree] Ctx Vol 1');
    bindStory(vol2.project.id, vol2.account.id, 'nb-ctx-2', '[Khepree] Ctx Vol 2');

    const chapter = db.chapters.create({
      project_id: vol2.project.id,
      chapter_number: 99,
      sequence_order: 99,
      display_title: 'Ch lore',
      chapter_type: 'NORMAL',
      source_text: '张小凡在青云门修炼筑基。',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: 'P1-LORE',
      sequence: 0,
      source_text: '张小凡在青云门修炼筑基。',
    });

    const ctx = buildMemoryContext(
      db,
      {
        projectId: vol2.project.id,
        chapterIds: [chapter.id],
        editionId: edition2,
      },
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
    expect(ctx.worldKnowledge.some((w) => w.key === 'series:青云门')).toBe(true);
    expect(ctx.activeTerms.some((t) => t.sourceText === '筑基')).toBe(true);
    expect(ctx.activeCharacters.some((c) => c.canonicalName === '张小凡')).toBe(true);

    const pack = buildTranslationPack(db, {
      projectId: vol2.project.id,
      chapterIds: [chapter.id],
      style: 'balanced',
      context: ctx,
      editionId: edition2,
    });
    expect(pack.prompt).toContain('[series:naming]');
    expect(pack.prompt).toContain('SERIES glossary');
    expect(pack.prompt).toContain('青云门');
    expect(pack.prompt).toContain('筑基');

    expect(
      getNotebookBindingService().getNotebookForStory(vol1.project.id)?.notebookId,
    ).toBe('nb-ctx-1');
    expect(
      getNotebookBindingService().getNotebookForStory(vol2.project.id)?.notebookId,
    ).toBe('nb-ctx-2');
  });
});
