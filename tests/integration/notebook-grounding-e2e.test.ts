/**
 * FULL-novel Notebook grounding E2E (offline harness).
 *
 * Flow: corpus → Research preprocess import → SQLite → 00–07 → Drive live
 * → version probe → local_context pack (SQLite terms) → Notebook grounded translate.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@main/db/database-manager';
import { pathsService } from '@main/services/paths-service';
import { FullNovelPreprocessService } from '@main/bootstrap/full-novel-preprocess-service';
import { NotebookSyncService } from '@main/notebook/notebook-sync-service';
import { NotebookKnowledgeBuilder } from '@main/notebook/knowledge-builder';
import { runKnowledgeVersionProbe } from '@main/notebook/notebook-version-probe';
import { resolveTranslationPackMode } from '@main/prompt/pack-mode-resolver';
import { buildTranslationPack } from '@main/prompt/translation-pack-builder';
import { buildMemoryContext } from '@main/memory/context-selector';
import { applyTermDelta } from '@main/learning/term-delta-processor';
import { resetNotebookSyncService } from '@main/notebook/notebook-sync-service-singleton';
import { toCharacterDto, toRelationshipDto } from '@main/services/memory-dto';
import { ensureDefaultEdition } from '@main/services/edition-service';
import { resolveCharacterPreferredName, resolveRelationshipAddressTerms } from '@main/memory/edition-memory';
import { KNOWLEDGE_FILE_NAMES, KNOWLEDGE_TYPES } from '@shared/constants/knowledge';
import {
  assertLocalPackContainsMapping,
  GROUNDING_PROBE,
  translateUsingNotebookKnowledge,
} from './helpers/notebook-grounded-translate';

const FIXTURE_DIR = path.resolve(
  __dirname,
  '../fixtures/full-novel-grounding',
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

function seedBindings(db: DatabaseManager, projectId: string, notebookId: string): void {
  for (const type of KNOWLEDGE_TYPES) {
    db.notebookSourceBindings.upsert({
      projectId,
      notebookId,
      knowledgeType: type,
      sourceName: KNOWLEDGE_FILE_NAMES[type],
      bindingType: 'STATIC_UPLOAD',
      status: 'active',
      driveFileId: `drive-${type}`,
    });
  }
}

describe('FULL-novel Notebook grounding E2E', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;
  let accountId: string;
  let chapterId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-grounding-e2e-'));
    pathsService.initializeAt(tmp);
    resetNotebookSyncService();
    db = new DatabaseManager({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });

    const project = db.projects.create({
      title: 'Grounding Fixture Novel',
      source_language: 'zh',
      target_language: 'vi',
      author_name: 'E2E',
      genre: 'xianxia',
    });
    projectId = project.id;

    const account = db.googleAccounts.create({
      label: 'Grounding Worker',
      email: 'grounding@test.com',
      displayName: 'Grounding',
      profileDirName: 'profile-grounding',
      status: 'READY',
    });
    accountId = account.id;

    const novel = loadFixture('novel-ch01.txt').trim();
    const chapter = db.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: '第一章 紫洛安试炼',
      source_text: novel,
      source_status: 'SOURCE_READY',
    });
    chapterId = chapter.id;

    const lines = novel.split(/\n+/).filter((l) => l.trim() && !/^第.+章/.test(l.trim()));
    lines.forEach((line, i) => {
      db.paragraphs.create({
        chapter_id: chapterId,
        paragraph_id: `C000001:P${String(i + 1).padStart(6, '0')}`,
        sequence: i + 1,
        source_text: line.trim(),
      });
    });

    db.notebooks.upsert({
      project_id: projectId,
      google_account_id: accountId,
      notebook_name: '[NovelTrans] Grounding Translation',
      notebook_role: 'TRANSLATION',
      notebook_id: 'nb-grounding',
      resource_url: 'https://notebook.google.com/grounding',
      status: 'sync_pending',
      instructions_hash: 'grounding-hash',
    });
    seedBindings(db, projectId, 'nb-grounding');
  });

  afterEach(() => {
    resetNotebookSyncService();
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function runFullImportAndVerify(): Promise<{
    sync: NotebookSyncService;
    docs: ReturnType<NotebookKnowledgeBuilder['buildAll']>;
    verifiedVersion: number;
  }> {
    const preprocess = new FullNovelPreprocessService(db);

    // 1) FULL preprocess: pack corpus + Research analysis import
    const packed = preprocess.packCorpus(projectId);
    expect(packed.parts.length).toBeGreaterThanOrEqual(1);
    const prompt = preprocess.getPrompt(projectId);
    expect(prompt.prompt).toContain('DO NOT TRANSLATE');
    expect(prompt.prompt).toContain('file:02_PROJECT_TERMS.md');

    const imported = preprocess.importResult(projectId, {
      text: loadFixture('research-response.md'),
      temporalProvenance: true,
    });
    expect(imported.foundKeys.length).toBeGreaterThanOrEqual(6);
    expect(imported.message).toMatch(/Imported/i);

    // 2) SQLite contains probe facts (candidates + character)
    const candidates = db.termCandidates.listPending(projectId);
    expect(candidates.some((c) => c.source_text === GROUNDING_PROBE.itemSource)).toBe(
      true,
    );
    expect(
      candidates.some((c) => c.source_text === GROUNDING_PROBE.characterSource),
    ).toBe(true);
    const character = db.characters.getByName(
      projectId,
      GROUNDING_PROBE.characterSource,
    );
    expect(character?.translated_name).toBe(GROUNDING_PROBE.characterVi);

    // Promote candidates → project terms (post-research confirm → structured vault)
    applyTermDelta(
      db,
      [
        {
          action: 'confirm',
          source: GROUNDING_PROBE.itemSource,
          target: GROUNDING_PROBE.itemVi,
        },
        {
          action: 'confirm',
          source: GROUNDING_PROBE.characterSource,
          target: GROUNDING_PROBE.characterVi,
        },
      ],
      { projectId, chapterNumber: 1 },
    );
    const itemTerm = db.terms.findBySource(GROUNDING_PROBE.itemSource, projectId);
    expect(itemTerm).toBeTruthy();
    expect(itemTerm?.locked).toBe(0);

    // 3) Build Translation Knowledge 00–07 (+ sync_state)
    const builder = new NotebookKnowledgeBuilder(db);
    let docs = builder.rebuildAndTrack(projectId);
    expect(docs['02_PROJECT_TERMS.md']).toContain(GROUNDING_PROBE.itemSource);
    expect(docs['02_PROJECT_TERMS.md']).toContain(GROUNDING_PROBE.itemVi);
    expect(docs['03_CHARACTERS.md']).toContain(GROUNDING_PROBE.characterSource);

    // 4) Drive LIVE sync (noop upload) → pending version
    const sync = new NotebookSyncService(db);
    await sync.syncLocalKnowledge(projectId);
    const pending = db.driveSyncState.ensure(projectId);
    expect(pending.pending_knowledge_version).toBeGreaterThan(0);
    expect(pending.pending_sync_nonce).toBeTruthy();
    expect(pending.version_probe_status).toBe('pending');

    // 5) Version probe → CONTENT_CURRENT
    const probe = await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () =>
        Promise.resolve(
          `NT_VERSION=${pending.pending_knowledge_version}\nNT_NONCE=${pending.pending_sync_nonce}`,
        ),
    });
    expect(probe.status).toBe('verified');
    expect(probe.reason).toBe('NOTEBOOK_VERSION_VERIFIED');

    const health = sync.getHealth(projectId, accountId);
    expect(health.knowledgeVerified).toBe(true);
    expect(health.status).toBe('ready');
    expect(health.usableForSlimPack).toBe(true);

    docs = builder.buildAll(projectId);
    return {
      sync,
      docs,
      verifiedVersion: pending.pending_knowledge_version,
    };
  }

  function buildLocalPackPrompt(): string {
    const mode = resolveTranslationPackMode(db, {
      projectId,
      accountId,
      providerType: 'PLAYWRIGHT_GEMINI',
      preferNotebookPack: true,
    });
    expect(mode.packMode).toBe('notebook_assisted');
    expect(mode.reason).toBe('notebook_assisted_explicit');

    const edition = ensureDefaultEdition(db, projectId);
    const context = buildMemoryContext(
      db,
      { projectId, chapterIds: [chapterId], editionId: edition.id },
      (characterId) => {
        const row = db.characters.getById(characterId);
        if (!row) return null;
        return toCharacterDto(
          row,
          db.characters.listAliases(row.id).map((a) => a.alias),
          resolveCharacterPreferredName(db, row, edition.id),
        );
      },
      (rel) => {
        const from = db.characters.getById(rel.from_character_id);
        const to = db.characters.getById(rel.to_character_id);
        const address = resolveRelationshipAddressTerms(db, rel, edition.id);
        return toRelationshipDto(
          rel,
          from?.canonical_name ?? rel.from_character_id,
          to?.canonical_name ?? rel.to_character_id,
          address,
        );
      },
    );

    // Soft match may see 玄星玉 in batch — must NOT enter SLIM overrides.
    expect(
      context.activeTerms.some((t) => t.sourceText === GROUNDING_PROBE.itemSource),
    ).toBe(true);

    const pack = buildTranslationPack(db, {
      projectId,
      chapterIds: [chapterId],
      style: 'balanced',
      context,
      packMode: 'local_context',
    });
    return pack.prompt;
  }

  it('FULL flow: Research → SQLite → version verify → local_context pack + Notebook term', async () => {
    const { docs } = await runFullImportAndVerify();

    const packPrompt = buildLocalPackPrompt();
    expect(packPrompt).toContain(GROUNDING_PROBE.itemSource);
    assertLocalPackContainsMapping(
      packPrompt,
      GROUNDING_PROBE.itemSource,
      GROUNDING_PROBE.itemVi,
    );

    const sourceLine =
      db.paragraphs
        .listByChapter(chapterId)
        .find((p) => p.source_text.includes(GROUNDING_PROBE.itemSource))?.source_text ??
      '';
    expect(sourceLine).toContain(GROUNDING_PROBE.itemSource);

    const knowledgeDocs: Record<string, string> = {
      '02_PROJECT_TERMS.md': docs['02_PROJECT_TERMS.md'],
      '03_CHARACTERS.md': docs['03_CHARACTERS.md'],
    };

    const translated = translateUsingNotebookKnowledge({
      sourceParagraph: sourceLine,
      notebookKnowledgeDocs: knowledgeDocs,
      probeSource: GROUNDING_PROBE.itemSource,
      probeExpectedVi: GROUNDING_PROBE.itemVi,
    });

    expect(translated).toContain(GROUNDING_PROBE.itemVi);
    expect(translated).not.toContain(GROUNDING_PROBE.itemSource);
  }, 60_000);

  it('UPDATE: term rename bumps version; pack + Notebook reflect new mapping', async () => {
    await runFullImportAndVerify();

    // User renames item translation
    applyTermDelta(
      db,
      [
        {
          action: 'confirm',
          source: GROUNDING_PROBE.itemSource,
          target: GROUNDING_PROBE.itemViUpdated,
        },
      ],
      { projectId, chapterNumber: 1 },
    );
    // Ensure preferred translation row updated
    const term = db.terms.findBySource(GROUNDING_PROBE.itemSource, projectId);
    if (!term) throw new Error('expected term row');
    db.terms.setTranslations(term.id, GROUNDING_PROBE.itemViUpdated, []);

    const sync = new NotebookSyncService(db);
    sync.markDirty(projectId, 'TERM_CHANGED');
    const builder = new NotebookKnowledgeBuilder(db);
    let docs = builder.rebuildAndTrack(projectId);
    expect(docs['02_PROJECT_TERMS.md']).toContain(GROUNDING_PROBE.itemViUpdated);

    await sync.syncLocalKnowledge(projectId);
    const pending = db.driveSyncState.ensure(projectId);
    const probe = await runKnowledgeVersionProbe(db, {
      projectId,
      accountId,
      capture: () =>
        Promise.resolve(
          `NT_VERSION=${pending.pending_knowledge_version}\nNT_NONCE=${pending.pending_sync_nonce}`,
        ),
    });
    expect(probe.status).toBe('verified');
    expect(pending.pending_knowledge_version).toBeGreaterThan(1);

    docs = builder.buildAll(projectId);
    const packPrompt = buildLocalPackPrompt();
    assertLocalPackContainsMapping(
      packPrompt,
      GROUNDING_PROBE.itemSource,
      GROUNDING_PROBE.itemViUpdated,
    );

    const sourceLine =
      db.paragraphs
        .listByChapter(chapterId)
        .find((p) => p.source_text.includes(GROUNDING_PROBE.itemSource))?.source_text ??
      '';

    const translated = translateUsingNotebookKnowledge({
      sourceParagraph: sourceLine,
      notebookKnowledgeDocs: {
        '02_PROJECT_TERMS.md': docs['02_PROJECT_TERMS.md'],
        '03_CHARACTERS.md': docs['03_CHARACTERS.md'],
      },
      probeSource: GROUNDING_PROBE.itemSource,
      probeExpectedVi: GROUNDING_PROBE.itemViUpdated,
    });

    expect(translated).toContain(GROUNDING_PROBE.itemViUpdated);
    expect(translated).not.toContain(GROUNDING_PROBE.itemVi);
  }, 60_000);
});
