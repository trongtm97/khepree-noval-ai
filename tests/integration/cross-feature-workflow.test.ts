/**
 * Cross-feature workflow proof (Release Hardening V4).
 *
 * Project → Series/World → Translate pack → Library Search → Production →
 * same Notebook → restart simulation → relationships intact.
 *
 * Does not mock buildStoryKnowledgeSnapshot in isolation — asserts downstream
 * consumption via buildMemoryContext + buildTranslationPack.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import {
  FictionSeriesService,
  resetFictionSeriesServiceForTests,
} from '@main/services/fiction-series-service';
import {
  getNotebookBindingService,
  resetNotebookBindingServiceForTests,
} from '@main/services/notebook-binding-service-singleton';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { JobService } from '@main/services/job-service';
import {
  getTranslationCampaignService,
  resetTranslationCampaignServiceForTests,
} from '@main/services/translation-campaign-service';
import { resetTranslationRecipeServiceForTests } from '@main/services/translation-recipe-service';
import { resetJobServiceForTests } from '@main/services/job-service-singleton';
import {
  getLibrarySearchService,
  resetLibrarySearchServiceForTests,
} from '@main/library-search/library-search-service';
import { buildLibrarySearchRoute } from '@main/library-search/index-builder';
import { buildStoryKnowledgeSnapshot } from '@main/knowledge/story-knowledge-snapshot';
import { NotebookKnowledgeBuilder } from '@main/notebook/knowledge-builder';
import { resolveTranslationNotebook } from '@main/notebook/notebook-resolver';
import { BUILTIN_RECIPE_IDS } from '@shared/constants/translation-recipes';

async function waitForReindex(svc: ReturnType<typeof getLibrarySearchService>): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    const progress = svc.getReindexProgress();
    if (!progress || progress.status === 'COMPLETED' || progress.status === 'FAILED') {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('cross-feature workflow: Project→Series→Translate→Search→Production→Restart', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-cross-feat-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetTranslationRecipeServiceForTests();
    resetJobServiceForTests();
    resetLibrarySearchServiceForTests();
  });

  afterEach(() => {
    resetLibrarySearchServiceForTests();
    resetJobServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('full connected product journey with Notebook create count = 0 after bind', async () => {
    const db = getDatabase();
    const seriesSvc = new FictionSeriesService(() => db);
    const binder = getNotebookBindingService();

    // ——— Create Project A, assign Series, seed known facts ———
    const series = seriesSvc.createSeries({ title: 'Cross Series' });
    const project = db.projects.create({ title: 'Story A' });
    const editionId = ensureDefaultEdition(db, project.id).id;
    seriesSvc.assignProjectToSeries({
      seriesId: series.id,
      projectId: project.id,
      force: true,
    });

    // Character alias A → B (series glossary)
    db.terms.create({
      source_text: '王林',
      scope: 'SERIES',
      scope_ref: series.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Vương Lâm',
      term_type: 'PERSON',
    });
    // World: Location X belongs to Faction Y
    seriesSvc.setWorldKnowledge(series.id, {
      'Location X': 'belongs to Faction Y',
    });
    // Style rule
    seriesSvc.upsertStyleRule({
      seriesId: series.id,
      kind: 'style',
      content: 'Keep sect titles untranslated on first mention',
    });

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      display_title: 'Ch 1 Cross',
      chapter_type: 'NORMAL',
      source_text: '王林 arrived at Location X of Faction Y.',
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 0,
      source_text: '王林 arrived at Location X of Faction Y.',
    });
    db.translations.create({
      paragraph_id: para.id,
      edition_id: editionId,
      translated_text: 'Vương Lâm đến Location X thuộc Faction Y.',
      status: 'translated',
    });
    // Untranslated chapter for Production enqueue (skipTranslated must still find work).
    const chapterPending = db.chapters.create({
      project_id: project.id,
      chapter_number: 2,
      sequence_order: 2,
      display_title: 'Ch 2 Pending',
      chapter_type: 'NORMAL',
      source_text: '足够长的源文本用于排队翻译作业第二段内容。',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapterPending.id,
      paragraph_id: '[C000002:P000001]',
      sequence: 0,
      source_text: '足够长的源文本用于排队翻译作业第二段内容。',
    });

    const account = db.googleAccounts.create({
      label: 'acc',
      email: 'cross@example.com',
      profileDirName: 'cross-p',
      status: 'READY',
    });

    // Existing Notebook binding N1 (create happens only here — pre-bound)
    binder.persistBinding({
      projectId: project.id,
      accountId: account.id,
      notebookName: '[Khepree] Story A',
      role: 'SINGLE',
      notebookId: 'nb-cross-N1',
      notebookUrl: 'https://notebooklm.google.com/notebook/nb-cross-N1',
      status: 'ready',
      lastVerifiedAt: '2026-09-04T12:00:00.000Z',
    });
    const notebookCountAfterBind = db.notebooks.listByProject(project.id).length;
    expect(notebookCountAfterBind).toBe(1);
    expect(binder.getNotebookForStory(project.id)?.notebookId).toBe('nb-cross-N1');

    // ——— Series edit → same N1, local dirty, create count unchanged ———
    seriesSvc.setWorldKnowledge(series.id, {
      'Location X': 'belongs to Faction Y',
      'Location Z': 'neutral zone',
    });
    expect(db.notebooks.listByProject(project.id)).toHaveLength(notebookCountAfterBind);
    expect(binder.getNotebookForStory(project.id)?.notebookId).toBe('nb-cross-N1');
    expect(db.knowledgeFiles.anyDirty(project.id)).toBe(true);

    const snapshot = buildStoryKnowledgeSnapshot(db, project.id);
    expect(snapshot.worldKnowledge['series:Location X']).toBe('belongs to Faction Y');
    expect(snapshot.worldKnowledge['series:Location Z']).toBe('neutral zone');

    const notebookMd = new NotebookKnowledgeBuilder(db).buildWorldKnowledge(project.id);
    expect(notebookMd).toContain('Faction Y');
    expect(notebookMd).toContain('neutral zone');

    // ——— Downstream Translate consumption (not snapshot-only mock) ———
    const { buildMemoryContext } = await import('@main/memory/context-selector');
    const { buildTranslationPack } = await import('@main/prompt/translation-pack-builder');
    const { toCharacterDto, toRelationshipDto } = await import('@main/services/memory-dto');
    const { resolveCharacterPreferredName } = await import('@main/memory/edition-memory');

    const ctx = buildMemoryContext(
      db,
      { projectId: project.id, chapterIds: [chapter.id], editionId },
      (id) => {
        const row = db.characters.getById(id);
        if (!row) return null;
        return toCharacterDto(
          row,
          db.characters.listAliases(row.id).map((a) => a.alias),
          resolveCharacterPreferredName(db, row, editionId),
        );
      },
      (rel) => {
        const from = db.characters.getById(rel.from_character_id);
        const to = db.characters.getById(rel.to_character_id);
        return toRelationshipDto(rel, from?.canonical_name ?? '?', to?.canonical_name ?? '?');
      },
    );
    expect(ctx.worldKnowledge.some((w) => w.key === 'series:Location X')).toBe(true);
    expect(ctx.activeTerms.some((t) => t.sourceText === '王林')).toBe(true);
    expect(ctx.criticalProjectRules.some((r) => r.includes('sect titles'))).toBe(true);

    const pack = buildTranslationPack(db, {
      projectId: project.id,
      chapterIds: [chapter.id],
      style: 'balanced',
      context: ctx,
      editionId,
    });
    expect(pack.prompt).toContain('Location X');
    expect(pack.prompt).toContain('Faction Y');
    expect(pack.prompt).toContain('王林');
    expect(pack.prompt).toContain('sect titles');

    // ——— Library Search: index → find → deep-link route ———
    const search = getLibrarySearchService(db);
    await search.startReindex(true);
    await waitForReindex(search);

    const foundWorld = search.query({ query: 'Faction Y' });
    expect(foundWorld.total).toBeGreaterThan(0);

    const foundTrans = search.query({ query: 'Vương Lâm đến' });
    expect(foundTrans.total).toBeGreaterThan(0);
    const translationHit = foundTrans.items.find((i) => i.entityType === 'translation');
    expect(translationHit?.route).toContain(`/projects/${project.id}/translate`);
    expect(translationHit?.route).toContain(`chapter=${chapter.id}`);
    expect(translationHit?.route).toContain('paragraph=');
    // Explicit route builder (same destination Translate expects)
    expect(
      buildLibrarySearchRoute({
        entityType: 'translation',
        entityId: para.id,
        projectId: project.id,
        chapterId: chapter.id,
        stableParagraphId: para.paragraph_id,
      }),
    ).toContain(`chapter=${chapter.id}`);
    expect(
      buildLibrarySearchRoute({
        entityType: 'translation',
        entityId: para.id,
        projectId: project.id,
        chapterId: chapter.id,
        stableParagraphId: para.paragraph_id,
      }),
    ).toContain(`paragraph=${encodeURIComponent(para.paragraph_id)}`);

    // ——— Production Center same project + same Notebook N1 ———
    const campaign = await getTranslationCampaignService().create({
      title: 'Cross Production',
      recipeId: BUILTIN_RECIPE_IDS.BALANCED,
      projectIds: [project.id],
    });
    const productionJobs = new JobService(db).enqueueTranslateNovel({
      projectId: project.id,
      chapterIds: [chapterPending.id],
      campaignId: campaign.campaignId,
      skipTranslated: true,
    });
    expect(productionJobs.jobs.length).toBeGreaterThan(0);
    expect(productionJobs.jobs[0]?.projectId).toBe(project.id);
    expect(binder.resolveNotebookForProductionJob(project.id)?.notebookId).toBe('nb-cross-N1');
    expect(resolveTranslationNotebook(db, project.id, account.id)?.notebook_id).toBe(
      'nb-cross-N1',
    );
    expect(db.notebooks.listByProject(project.id)).toHaveLength(notebookCountAfterBind);

    // Retry path must not create
    const ensure = vi.fn();
    const page = {
      url: () => 'https://notebooklm.google.com/',
      goto: async () => undefined,
    } as unknown as import('playwright').Page;
    const retry = await binder.reuseNotebookBindingForRetry({
      projectId: project.id,
      accountId: account.id,
      preferredName: '[Khepree] Story A',
      role: 'SINGLE',
      provider: {
        ensureNotebook: ensure,
        findNotebookByName: async (name: string) => ({
          name,
          id: 'nb-cross-N1',
          url: 'https://notebooklm.google.com/notebook/nb-cross-N1',
        }),
        openNotebook: async (name: string) => ({
          name,
          id: 'nb-cross-N1',
          url: 'https://notebooklm.google.com/notebook/nb-cross-N1',
        }),
      } as never,
      page,
    });
    expect(retry.outcome).toBe('reused');
    if (retry.outcome === 'reused') {
      expect(retry.binding.notebookId).toBe('nb-cross-N1');
    }
    expect(ensure).not.toHaveBeenCalled();
    expect(db.notebooks.listByProject(project.id)).toHaveLength(notebookCountAfterBind);

    // ——— Restart simulation: durable relationships ———
    resetFictionSeriesServiceForTests();
    resetNotebookBindingServiceForTests();
    resetLibrarySearchServiceForTests();
    resetTranslationCampaignServiceForTests();
    resetJobServiceForTests();

    const restartedSeries = new FictionSeriesService(() => getDatabase());
    const world = restartedSeries.getWorldKnowledge(series.id);
    expect(world.worldKnowledge['Location X']).toBe('belongs to Faction Y');
    expect(world.worldKnowledge['Location Z']).toBe('neutral zone');

    expect(getNotebookBindingService().getNotebookForStory(project.id)?.notebookId).toBe(
      'nb-cross-N1',
    );
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
    expect(db.chapters.getById(chapter.id)?.id).toBe(chapter.id);
    expect(db.translations.getByParagraphId(para.id, editionId)?.translated_text).toContain(
      'Vương Lâm',
    );

    // Search still works after service reset (same SQLite)
    const searchAfter = getLibrarySearchService(db);
    expect(searchAfter.query({ query: 'Faction Y' }).total).toBeGreaterThan(0);

    // Unbound Story B on same series: dirty only, create = 0
    const projectB = db.projects.create({ title: 'Story B unbound' });
    restartedSeries.assignProjectToSeries({
      seriesId: series.id,
      projectId: projectB.id,
      force: true,
    });
    restartedSeries.setWorldKnowledge(series.id, {
      'Location X': 'belongs to Faction Y',
      'Location Z': 'neutral zone',
      extra: 'after-B',
    });
    expect(db.notebooks.listByProject(projectB.id)).toHaveLength(0);
    expect(getNotebookBindingService().getNotebookForStory(projectB.id)).toBeNull();
    expect(db.knowledgeFiles.anyDirty(projectB.id)).toBe(true);
    // Story A still N1
    expect(getNotebookBindingService().getNotebookForStory(project.id)?.notebookId).toBe(
      'nb-cross-N1',
    );
    expect(db.notebooks.listByProject(project.id)).toHaveLength(1);
  });
});
