/**
 * MULTILINGUAL × NOTEBOOK × CONCURRENCY release matrix
 *
 * Mock provider only — no live Google. Maps to
 * docs/MULTILINGUAL_CONCURRENCY_RELEASE_AUDIT.md.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { createDatabaseManager, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { JobService } from '@main/services/job-service';
import { AutomationScheduler } from '@main/jobs/scheduler';
import { canAdmitJob, buildConcurrencySnapshot } from '@main/jobs/concurrency-policy';
import { DEFAULT_CONCURRENCY_POLICY } from '@shared/constants/concurrency-policy';
import { profileLockManager } from '@main/automation/browser-runner/profile-lock';
import { browserProfileManager } from '@main/automation/browser-runner/profile-manager';
import {
  formatTranslationTaskHeader,
  resolveLanguagePairRules,
} from '@shared/constants/translation-style-model';
import { formatAiLanguageIdentity, getLanguageProfile } from '@shared/constants/language-profile';
import { assemblePackSections } from '@main/prompt/translation-pack-builder';
import { buildMemoryContext } from '@main/memory/context-selector';
import { toCharacterDto, toRelationshipDto } from '@main/services/memory-dto';
import {
  resolveCharacterPreferredName,
  resolveRelationshipAddressTerms,
} from '@main/memory/edition-memory';
import {
  createEdition,
  ensureDefaultEdition,
  switchEdition,
} from '@main/services/edition-service';
import { formatNotebookNameForRole } from '@shared/constants/notebook-role';
import { loadNovelExportData } from '@main/portability/novel-export-builder';
import type { MemoryContextDto } from '@shared/schemas/memory';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';
import {
  createTranslationWave,
  setParallelWavesEnabled,
  storeWaveProvisional,
  tryAdvanceWaveCommit,
} from '@main/jobs/wave-service';
import {
  validateWaveConsistency,
  stripConflictingDeltas,
} from '@main/jobs/wave-consistency-validator';

/** Release matrix language pairs (source → target). */
export const MATRIX_LANGUAGE_PAIRS = [
  ['zh-Hans', 'vi'],
  ['zh-Hans', 'en'],
  ['en', 'vi'],
  ['ja', 'en'],
  ['ko', 'vi'],
  ['vi', 'en'],
  ['es', 'en'],
] as const;

const LEAK_ZH_VI = /Chinese\s*[→\-–—]\s*Vietnamese|Translate Chinese\s*[→\-–—]\s*Vietnamese/i;

const EMPTY_CONTEXT: MemoryContextDto = {
  activeTerms: [],
  activeCharacters: [],
  relationships: [],
  recentMemory: [],
  criticalProjectRules: [],
  anchorChapter: 1,
  recentWindow: { fromChapter: 1, toChapter: 1 },
  budget: { limit: 4000, estimated: 0, dropped: 0 },
};

const P1 = '[C000001:P000001]';
const P2 = '[C000001:P000002]';
const batch = [
  { paragraphId: P1, sourceText: '第一段' },
  { paragraphId: P2, sourceText: '第二段' },
];

function okResponse(): string {
  return [
    '<TRANSLATION>',
    `${P1} Đoạn một.`,
    `${P2} Đoạn hai.`,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 6_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await sleep(25);
  }
}

function emptyParsed(overrides?: Partial<ParsedBatchResult>): ParsedBatchResult {
  return {
    status: 'ok',
    translations: [{ paragraphId: P1, text: 'ok' }],
    termDeltas: [],
    memoryDeltas: [],
    warnings: [],
    recoveryUsed: false,
    protocolVersion: 1,
    ...overrides,
  };
}

describe('MATRIX / MULTILINGUAL — language pairs (mock)', () => {
  for (const [source, target] of MATRIX_LANGUAGE_PAIRS) {
    it(`prompt + pack ${source} → ${target}`, () => {
      const sourceProfile = getLanguageProfile(source);
      const targetProfile = getLanguageProfile(target);
      const header = formatTranslationTaskHeader({
        sourceLanguage: source,
        targetLanguage: target,
        styleLabel: 'balanced',
        range: 'chapter 1',
      });

      expect(header).toContain('Source language:');
      expect(header).toContain('Target language:');
      expect(header).toContain(sourceProfile.internationalName);
      expect(header).toContain(sourceProfile.nativeName);
      expect(header).toContain(targetProfile.internationalName);
      expect(header).toContain(targetProfile.nativeName);
      expect(header).toContain(formatAiLanguageIdentity(source));
      expect(header).not.toMatch(LEAK_ZH_VI);

      const { sections } = assemblePackSections({
        style: 'balanced',
        chapterNumbers: [1],
        criticalRules: [],
        context: EMPTY_CONTEXT,
        sourceLines: [`${P1} sample`],
        sourceLanguage: source,
        targetLanguage: target,
      });

      expect(sections.taskHeader).toContain(formatAiLanguageIdentity(source));
      expect(sections.taskHeader).toContain(formatAiLanguageIdentity(target));
      expect(sections.taskHeader).not.toMatch(LEAK_ZH_VI);
      expect(sections.outputProtocol).toContain('TARGET_LANGUAGE_TRANSLATION');
      expect(sections.outputProtocol).not.toMatch(/Vietnamese translation/i);

      // Pair rules must not inject zh→vi policy into unrelated pairs.
      if (!(source.startsWith('zh') && target === 'vi')) {
        const rules = resolveLanguagePairRules(source, target).join('\n');
        expect(rules).not.toMatch(/Hán-Việt/i);
      }
    });
  }
});

describe('MATRIX / MULTILINGUAL — terms / characters / export / notebook', () => {
  let db: DatabaseManager;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-matrix-ml-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('terms pair-isolated: VI preferred name does not appear in EN pack', () => {
    const project = db.projects.create({
      title: '仙逆',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    ensureDefaultEdition(db, project.id);
    createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
      name: 'Renegade Immortal',
      activate: false,
    });

    db.terms.create({
      source_text: '王林',
      source_simplified: '王林',
      source_language: 'zh-Hans',
      target_language: 'vi',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Vương Lâm',
      locked: true,
    });
    db.terms.create({
      source_text: '王林',
      source_simplified: '王林',
      source_language: 'zh-Hans',
      target_language: 'en',
      scope: 'PROJECT',
      scope_ref: project.id,
      status: 'PROJECT_VERIFIED',
      preferred_translation: 'Wang Lin',
    });

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: 'Ch1',
      source_text: '王林走进山谷。',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: P1,
      sequence: 1,
      source_text: '王林走进山谷。',
    });

    const viEdition = ensureDefaultEdition(db, project.id);
    switchEdition(db, {
      projectId: project.id,
      editionId: viEdition.id,
    });
    const mapCharacter = (editionId: string) => (characterId: string) => {
      const row = db.characters.getById(characterId);
      if (!row) return null;
      return toCharacterDto(
        row,
        db.characters.listAliases(row.id).map((a) => a.alias),
        resolveCharacterPreferredName(db, row, editionId),
      );
    };
    const mapRelationship = (editionId: string) => (
      rel: Parameters<typeof toRelationshipDto>[0],
    ) => {
      const from = db.characters.getById(rel.from_character_id);
      const to = db.characters.getById(rel.to_character_id);
      const address = resolveRelationshipAddressTerms(db, rel, editionId);
      return toRelationshipDto(
        rel,
        from?.canonical_name ?? rel.from_character_id,
        to?.canonical_name ?? rel.to_character_id,
        address,
      );
    };

    const viCtx = buildMemoryContext(
      db,
      { projectId: project.id, chapterIds: [chapter.id], editionId: viEdition.id },
      mapCharacter(viEdition.id),
      mapRelationship(viEdition.id),
    );
    expect(viCtx.activeTerms.some((t) => t.preferredTranslation === 'Vương Lâm')).toBe(true);
    expect(viCtx.activeTerms.every((t) => t.preferredTranslation !== 'Wang Lin')).toBe(true);

    // Switch to EN edition — project.target_language flips
    const enEdition = db.translationEditions
      .listByProject(project.id)
      .find((e) => e.target_language === 'en');
    expect(enEdition).toBeTruthy();
    if (!enEdition) throw new Error('EN edition missing');
    switchEdition(db, { projectId: project.id, editionId: enEdition.id });

    const enCtx = buildMemoryContext(
      db,
      { projectId: project.id, chapterIds: [chapter.id], editionId: enEdition.id },
      mapCharacter(enEdition.id),
      mapRelationship(enEdition.id),
    );
    expect(enCtx.activeTerms.some((t) => t.preferredTranslation === 'Wang Lin')).toBe(true);
    expect(enCtx.activeTerms.every((t) => t.preferredTranslation !== 'Vương Lâm')).toBe(true);

    const { sections } = assemblePackSections({
      style: 'balanced',
      chapterNumbers: [1],
      criticalRules: [],
      context: enCtx,
      sourceLines: [`${P1} 王林走进山谷。`],
      sourceLanguage: 'zh-Hans',
      targetLanguage: 'en',
    });
    expect(sections.taskHeader).not.toMatch(LEAK_ZH_VI);
    expect(JSON.stringify(sections)).toContain('Wang Lin');
    expect(JSON.stringify(sections)).not.toContain('Vương Lâm');
  });

  it('character preferred names are edition-scoped via character_translations', () => {
    const project = db.projects.create({
      title: 'Char Novel',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const vi = ensureDefaultEdition(db, project.id);
    const { edition: en } = createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
      name: 'EN',
      activate: false,
    });
    const char = db.characters.create({
      project_id: project.id,
      canonical_name: '王林',
      status: 'active',
      first_chapter: 1,
    });
    db.characterTranslations.upsert({
      character_id: char.id,
      edition_id: vi.id,
      target_language: 'vi',
      preferred_name: 'Vương Lâm',
      source: 'test',
    });
    db.characterTranslations.upsert({
      character_id: char.id,
      edition_id: en.id,
      target_language: 'en',
      preferred_name: 'Wang Lin',
      source: 'test',
    });

    expect(resolveCharacterPreferredName(db, char, vi.id)).toBe('Vương Lâm');
    expect(resolveCharacterPreferredName(db, char, en.id)).toBe('Wang Lin');
    expect(resolveCharacterPreferredName(db, char, en.id)).not.toBe('Vương Lâm');
  });

  it('Research notebook shared; Translation notebook names edition-scoped', () => {
    expect(formatNotebookNameForRole('仙逆', 'RESEARCH')).toBe('[Research] 仙逆');
    expect(
      formatNotebookNameForRole('仙逆', 'TRANSLATION', {
        targetLanguage: 'vi',
        editionTitle: 'Tiên Nghịch',
      }),
    ).toBe('[Translation][VI] Tiên Nghịch');
    expect(
      formatNotebookNameForRole('仙逆', 'TRANSLATION', {
        targetLanguage: 'en',
        editionTitle: 'Renegade Immortal',
      }),
    ).toBe('[Translation][EN] Renegade Immortal');
  });

  it('export metadata + body follow active edition target language', () => {
    const project = db.projects.create({
      title: 'Export Novel',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const vi = ensureDefaultEdition(db, project.id);
    const { edition: en } = createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
      name: 'EN Edition',
      activate: false,
    });

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      chapter_title: '第一章',
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: P1,
      sequence: 1,
      source_text: '你好',
    });
    db.translations.upsert({
      paragraph_id: para.id,
      edition_id: vi.id,
      translated_text: 'Xin chào',
      version_source: 'AI_INITIAL',
    });
    db.translations.upsert({
      paragraph_id: para.id,
      edition_id: en.id,
      translated_text: 'Hello',
      version_source: 'AI_INITIAL',
    });

    switchEdition(db, { projectId: project.id, editionId: vi.id });
    const viExport = loadNovelExportData(db, {
      projectId: project.id,
      translatedOnly: true,
    });
    expect(viExport.targetLanguage).toBe('vi');
    expect(viExport.chapters[0]?.paragraphs[0]?.translatedText).toBe('Xin chào');

    switchEdition(db, { projectId: project.id, editionId: en.id });
    const enExport = loadNovelExportData(db, {
      projectId: project.id,
      translatedOnly: true,
    });
    expect(enExport.targetLanguage).toBe('en');
    expect(enExport.targetLanguageLabel).toBe(getLanguageProfile('en').nativeName);
    expect(enExport.chapters[0]?.paragraphs[0]?.translatedText).toBe('Hello');
    expect(enExport.chapters[0]?.paragraphs[0]?.translatedText).not.toBe('Xin chào');
  });
});

describe('MATRIX / CONCURRENCY — mock scheduler', () => {
  let tempRoot: string;
  let db: DatabaseManager;
  let service: JobService;
  let scheduler: AutomationScheduler | null = null;
  const accounts: { accountId: string; workerId: string; dir: string }[] = [];

  function seedAccount(label: string, dirName: string) {
    const account = db.googleAccounts.create({
      label,
      email: `${label}@example.com`,
      profileDirName: dirName,
      status: 'READY',
    });
    fs.mkdirSync(browserProfileManager.resolveProfilePath(dirName), { recursive: true });
    const worker = db.workerStates.getByAccountId(account.id);
    if (!worker) throw new Error('worker missing');
    db.workerStates.setHealth(worker.id, 'READY');
    db.getConnection()
      .prepare(`UPDATE worker_states SET provider_type = ? WHERE id = ?`)
      .run('PLAYWRIGHT_GEMINI', worker.id);
    const row = { accountId: account.id, workerId: worker.id, dir: dirName };
    accounts.push(row);
    return row;
  }

  beforeEach(() => {
    accounts.length = 0;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-matrix-conc-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    fs.mkdirSync(paths.browserProfiles, { recursive: true });
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    service = new JobService(db);
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop({ waitMs: 2_000 });
      scheduler = null;
    }
    for (const a of accounts) {
      try {
        profileLockManager.recoverIfStale(
          browserProfileManager.resolveProfilePath(a.dir),
          Date.now() + 10_000_000,
        );
      } catch {
        /* ignore */
      }
    }
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('policy: one Playwright account → never 2 concurrent admits', () => {
    const snap = buildConcurrencySnapshot([
      {
        jobId: 'j1',
        projectId: 'p1',
        accountId: 'acc-shared',
        providerKind: 'PLAYWRIGHT_GEMINI',
      },
    ]);
    expect(
      canAdmitJob(DEFAULT_CONCURRENCY_POLICY, snap, {
        projectId: 'p2',
        accountId: 'acc-shared',
        providerKind: 'PLAYWRIGHT_GEMINI',
      }),
    ).toBe(false);
  });

  it('3 workers × 3 projects → all run concurrently', async () => {
    const a = seedAccount('a', 'mx-a');
    const b = seedAccount('b', 'mx-b');
    const c = seedAccount('c', 'mx-c');
    const p1 = db.projects.create({ title: 'P1' }).id;
    const p2 = db.projects.create({ title: 'P2' }).id;
    const p3 = db.projects.create({ title: 'P3' }).id;
    for (const [projectId, accountId] of [
      [p1, a.accountId],
      [p2, b.accountId],
      [p3, c.accountId],
    ] as const) {
      db.googleAccounts.assignProject(accountId, projectId);
    }

    const started: string[] = [];
    const gates = new Map<string, () => void>();
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: async (ctx) => {
        started.push(ctx.accountId);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });
    service.attachScheduler(scheduler);

    for (const [projectId, accountId] of [
      [p1, a.accountId],
      [p2, b.accountId],
      [p3, c.accountId],
    ] as const) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: 1,
        chapterTo: 1,
        workerMode: 'PINNED',
        pinnedAccountId: accountId,
        sourceParagraphIds: [P1, P2],
        batchParagraphs: batch,
      });
    }

    scheduler.start();
    await waitFor(() => started.length === 3);
    expect(new Set(started).size).toBe(3);
    expect(scheduler.getInFlightCount()).toBe(3);
    for (const release of gates.values()) release();
    await waitFor(() => (scheduler?.getInFlightCount() ?? 1) === 0);
  });

  it('scheduler: shared Playwright account never runs 2 jobs at once', async () => {
    const shared = seedAccount('shared', 'mx-shared');
    const p1 = db.projects.create({ title: 'Share1' }).id;
    const p2 = db.projects.create({ title: 'Share2' }).id;
    db.googleAccounts.assignProject(shared.accountId, p1);
    db.googleAccounts.assignProject(shared.accountId, p2);

    let peak = 0;
    let inFlight = 0;
    const started: string[] = [];
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: async (ctx) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        started.push(ctx.job.id);
        await sleep(80);
        inFlight -= 1;
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });
    service.attachScheduler(scheduler);

    service.enqueueTranslate({
      projectId: p1,
      chapterFrom: 1,
      chapterTo: 1,
      workerMode: 'PINNED',
      pinnedAccountId: shared.accountId,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });
    service.enqueueTranslate({
      projectId: p2,
      chapterFrom: 1,
      chapterTo: 1,
      workerMode: 'PINNED',
      pinnedAccountId: shared.accountId,
      sourceParagraphIds: [P1, P2],
      batchParagraphs: batch,
    });

    scheduler.start();
    await waitFor(() => started.length === 2);
    await waitFor(() => (scheduler?.getInFlightCount() ?? 1) === 0);
    expect(peak).toBe(1);
  });

  it('quota worker A → B/C continue', async () => {
    const a = seedAccount('a', 'mx-qa');
    const b = seedAccount('b', 'mx-qb');
    const c = seedAccount('c', 'mx-qc');
    const pA = db.projects.create({ title: 'A' }).id;
    const pB = db.projects.create({ title: 'B' }).id;
    const pC = db.projects.create({ title: 'C' }).id;
    const until = new Date(Date.now() + 60_000).toISOString();
    db.workerStates.markLimited(a.workerId, until, 'QUOTA_LIMIT');

    const startedAccounts: string[] = [];
    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: (ctx) => {
        startedAccounts.push(ctx.accountId);
        return Promise.resolve({ rawResponse: okResponse(), inputRef: ctx.job.id });
      },
    });
    service.attachScheduler(scheduler);

    for (const [projectId, accountId] of [
      [pA, a.accountId],
      [pB, b.accountId],
      [pC, c.accountId],
    ] as const) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: 1,
        chapterTo: 1,
        workerMode: 'PINNED',
        pinnedAccountId: accountId,
        sourceParagraphIds: [P1, P2],
        batchParagraphs: batch,
      });
    }

    scheduler.start();
    await waitFor(() => startedAccounts.length === 2);
    expect(startedAccounts).not.toContain(a.accountId);
    expect(new Set(startedAccounts)).toEqual(new Set([b.accountId, c.accountId]));
  });

  it('one project default → max 1 job', async () => {
    seedAccount('a', 'mx-one-a');
    seedAccount('b', 'mx-one-b');
    const projectId = db.projects.create({ title: 'Solo' }).id;
    const started: string[] = [];
    const gates = new Map<string, () => void>();

    scheduler = new AutomationScheduler(db, {
      maxConcurrentWorkers: 3,
      tickMs: 40,
      sendInitial: async (ctx) => {
        started.push(ctx.job.id);
        await new Promise<void>((resolve) => {
          gates.set(ctx.job.id, resolve);
        });
        return { rawResponse: okResponse(), inputRef: ctx.job.id };
      },
    });
    service.attachScheduler(scheduler);

    for (let i = 1; i <= 3; i += 1) {
      service.enqueueTranslate({
        projectId,
        chapterFrom: i,
        chapterTo: i,
        workerMode: 'POOL',
        sourceParagraphIds: [P1, P2],
        batchParagraphs: batch,
        priority: i,
      });
    }

    scheduler.start();
    await waitFor(() => started.length === 1);
    await sleep(120);
    expect(started.length).toBe(1);
    expect(scheduler.getInFlightCount()).toBe(1);
    const firstJobId = started[0];
    expect(firstJobId).toBeTruthy();
    if (firstJobId) gates.get(firstJobId)?.();
    await waitFor(() => started.length === 2);
  });
});

describe('MATRIX / PARALLEL WAVES — experimental', () => {
  let db: DatabaseManager;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-matrix-wave-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = createDatabaseManager({ dataDir: paths.data, backupsDir: paths.backups });
    setParallelWavesEnabled(db, true);
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('3 provisional jobs commit in chapter order (B finishes first)', async () => {
    const project = db.projects.create({ title: 'Wave3' });
    const mkJob = (from: number, to: number) =>
      db.jobs.create({
        project_id: project.id,
        type: 'translate_batch',
        state: 'QUEUED',
        priority: from,
        chapter_from: from,
        chapter_to: to,
        worker_mode: 'POOL',
        config: '{}',
      });
    const jA = mkJob(101, 103);
    const jB = mkJob(104, 106);
    const jC = mkJob(107, 109);
    const wave = createTranslationWave(db, {
      projectId: project.id,
      jobs: [
        { jobId: jC.id, chapterFrom: 107, chapterTo: 109 },
        { jobId: jA.id, chapterFrom: 101, chapterTo: 103 },
        { jobId: jB.id, chapterFrom: 104, chapterTo: 106 },
      ],
    });

    await storeWaveProvisional(db, jC.id, {
      parsed: emptyParsed({ translations: [{ paragraphId: '[C000003:P000001]', text: 'C' }] }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 107,
      chapterTo: 109,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });
    await storeWaveProvisional(db, jB.id, {
      parsed: emptyParsed({ translations: [{ paragraphId: '[C000002:P000001]', text: 'B' }] }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 104,
      chapterTo: 106,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    const mid = await tryAdvanceWaveCommit(db, wave.waveId);
    expect(mid.committed).toBe(0);
    expect(mid.blocked).toBe(true);

    await storeWaveProvisional(db, jA.id, {
      parsed: emptyParsed({ translations: [{ paragraphId: '[C000001:P000001]', text: 'A' }] }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 101,
      chapterTo: 103,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    const rows = db.translationWaves.listWaveJobsOrdered(wave.waveId);
    expect(rows.map((r) => r.commit_status)).toEqual([
      'COMMITTED',
      'COMMITTED',
      'COMMITTED',
    ]);
    expect(db.translationWaves.getWaveById(wave.waveId)?.status).toBe('COMPLETED');
  });

  it('earlier term conflict → later job soft-strips / hard retranslate', () => {
    const prior = emptyParsed({
      termDeltas: [
        { action: 'discover', source: '李四', target: 'Lý Tứ', category: 'name' },
      ],
      memoryDeltas: [
        {
          action: 'story_state',
          summaryText: 'Hero left the city',
          currentChapterNumber: 101,
        },
      ],
    });

    const soft = validateWaveConsistency({
      committed: [prior],
      candidate: emptyParsed({
        termDeltas: [
          { action: 'discover', source: '李四', target: 'Lý Tư', category: 'name' },
        ],
      }),
    });
    expect(soft.action).toBe('repair');
    const stripped = stripConflictingDeltas(
      emptyParsed({
        termDeltas: [
          { action: 'discover', source: '李四', target: 'Lý Tư', category: 'name' },
        ],
      }),
      soft.conflicts,
    );
    expect(stripped.termDeltas).toHaveLength(0);

    const hard = validateWaveConsistency({
      committed: [prior],
      candidate: emptyParsed({
        memoryDeltas: [
          {
            action: 'story_state',
            summaryText: 'Hero never left',
            currentChapterNumber: 104,
          },
        ],
      }),
    });
    expect(hard.action).toBe('retranslate');
  });

  it('no out-of-order Memory Delta apply (later conflicting story_state → RETRANSLATE)', async () => {
    const project = db.projects.create({ title: 'WaveMem' });
    const jA = db.jobs.create({
      project_id: project.id,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 101,
      chapter_from: 101,
      chapter_to: 103,
      worker_mode: 'POOL',
      config: '{}',
    });
    const jB = db.jobs.create({
      project_id: project.id,
      type: 'translate_batch',
      state: 'QUEUED',
      priority: 104,
      chapter_from: 104,
      chapter_to: 106,
      worker_mode: 'POOL',
      config: '{}',
    });
    const wave = createTranslationWave(db, {
      projectId: project.id,
      jobs: [
        { jobId: jA.id, chapterFrom: 101, chapterTo: 103 },
        { jobId: jB.id, chapterFrom: 104, chapterTo: 106 },
      ],
    });

    await storeWaveProvisional(db, jA.id, {
      parsed: emptyParsed({
        memoryDeltas: [
          {
            action: 'story_state',
            summaryText: 'A wins',
            currentChapterNumber: 101,
          },
        ],
      }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 101,
      chapterTo: 103,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });
    await storeWaveProvisional(db, jB.id, {
      parsed: emptyParsed({
        memoryDeltas: [
          {
            action: 'story_state',
            summaryText: 'A loses',
            currentChapterNumber: 104,
          },
        ],
      }),
      versionSource: 'AI_INITIAL',
      chapterFrom: 104,
      chapterTo: 106,
      chaptersCompleted: 3,
      sourceContextByParagraph: {},
    });

    const rows = db.translationWaves.listWaveJobsOrdered(wave.waveId);
    expect(rows[0].commit_status).toBe('COMMITTED');
    expect(rows[1].commit_status).toBe('RETRANSLATE');
  });
});
