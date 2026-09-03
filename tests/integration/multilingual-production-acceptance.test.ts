/**
 * Phase 8 — production prompt wiring acceptance (offline).
 * Proves Project → Edition → Job → AiProviderManager → IAIProvider prompt path.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase, closeDatabase } from '@main/db/connection';
import type { DatabaseManager } from '@main/db/database-manager';
import { resolveAppPaths, pathsService } from '@main/services/paths-service';
import { AiProviderManager } from '@main/ai/ai-provider-manager';
import type { IAIProvider } from '@main/ai/iai-provider';
import type { AIResponse, SendPromptOptions } from '@main/ai/types';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { newId } from '@main/db/utils/uuid';
import { getTranslationPackService } from '@main/services/translation-pack-service-singleton';
import {
  createEdition,
  ensureDefaultEdition,
} from '@main/services/edition-service';
import { formatAiLanguageIdentity } from '@shared/constants/language-profile';
import {
  TranslationLanguagePairMissingError,
  TRANSLATION_LANGUAGE_PAIR_MISSING,
} from '@shared/constants/translation-language';
import { requireRepairLanguagePair } from '@main/jobs/repair-language-pair';
import { buildRepairPack } from '@main/jobs/repair-pack-builder';
import { hashPrompt } from '@main/jobs/repair-loop';
import { pairFingerprint } from '../helpers/golden-prompt-assertions';
import { checkProviderForJob } from '@main/ai/provider-preflight';

vi.mock('@main/ai/provider-preflight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/ai/provider-preflight')>();
  return {
    ...actual,
    checkProviderForJob: vi.fn(),
  };
});

function mockProvider(
  id: string,
  type: IAIProvider['providerType'],
  onSend: (pack: TranslationPackDto) => Promise<AIResponse>,
): IAIProvider {
  return {
    providerId: id,
    providerType: type,
    initialize: vi.fn(() => Promise.resolve()),
    healthCheck: vi.fn(() =>
      Promise.resolve({ ok: true, status: 'READY' as const, message: 'ok' }),
    ),
    sendPrompt: vi.fn((pack: TranslationPackDto, _opts?: SendPromptOptions) => onSend(pack)),
    cancelRequest: vi.fn(() => Promise.resolve()),
    getStatus: vi.fn(() =>
      Promise.resolve({
        providerId: id,
        type,
        ready: true,
        message: 'ok',
      }),
    ),
    close: vi.fn(() => Promise.resolve()),
  };
}

function seedReadyWebAccount(db: DatabaseManager, googleAccountId: string): void {
  const now = new Date().toISOString();
  db.aiProviders.setStatus(AI_PROVIDER_IDS.GEMINI_WEB_API, 'READY');
  db.getConnection()
    .prepare(
      `INSERT OR REPLACE INTO ai_accounts (
        id, provider_id, google_account_id, session_location, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'READY', ?, ?)`,
    )
    .run(newId(), AI_PROVIDER_IDS.GEMINI_WEB_API, googleAccountId, 'acceptance-session', now, now);
}

function okTranslateResponse(ids: string[]): string {
  return [
    '<TRANSLATION>',
    ...ids.map((id, i) => `${id} Translated line ${i + 1}.`),
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
}

describe('multilingual production acceptance', () => {
  let tempRoot: string;
  let db: DatabaseManager;

  beforeEach(() => {
    vi.mocked(checkProviderForJob).mockImplementation((_db, input) =>
      Promise.resolve({
        providerId: input.providerId,
        result: 'READY',
        message: 'ok',
        checks: {},
      }),
    );
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-accept-'));
    pathsService.initializeAt(tempRoot);
    const paths = resolveAppPaths(tempRoot);
    closeDatabase();
    db = initializeDatabase({ dataDir: paths.data, backupsDir: paths.backups });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('AiProviderManager.sendForJob captures production TranslationPack prompt', async () => {
    const project = db.projects.create({
      title: 'Acceptance Novel',
      source_language: 'ja',
      target_language: 'en',
    });
    const edition = ensureDefaultEdition(db, project.id);
    db.projects.update(project.id, { target_language: 'en' });
    db.translationEditions.update(edition.id, { targetLanguage: 'en' });

    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '彼は走った。',
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: P1,
      sequence: 1,
      source_text: '彼は走った。',
    });

    const account = db.googleAccounts.create({
      label: 'acceptance',
      email: 'accept@test.com',
      profileDirName: 'profile-accept',
      status: 'READY',
    });
    seedReadyWebAccount(db, account.id);

    const job = db.jobs.create({
      project_id: project.id,
      type: 'TRANSLATE',
      edition_id: edition.id,
      chapter_from: 1,
      chapter_to: 1,
      config: JSON.stringify({
        batchParagraphs: [{ paragraphId: para.paragraph_id, sourceText: para.source_text }],
        sourceParagraphIds: [para.paragraph_id],
        chapterIds: [chapter.id],
      }),
    });

    let captured: TranslationPackDto | null = null;
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', (pack) => {
      captured = pack;
      return Promise.resolve({
        requestId: '1',
        status: 'SUCCESS',
        text: okTranslateResponse([para.paragraph_id]),
      });
    });

    const manager = new AiProviderManager(db);
    manager.register(web);

    const result = await manager.sendForJob({
      job,
      executionTarget: {
        workerId: `prov-playwright-gemini:${account.id}`,
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        providerType: 'PLAYWRIGHT_GEMINI',
        accountKind: 'GOOGLE_ACCOUNT',
        accountId: account.id,
        concurrencyKey: account.id,
        status: 'READY',
        capabilities: {
          browserProfile: true,
          notebookRequired: false,
          webApiWorker: false,
        },
        legacyWorkerStateId: null,
      },
      accountId: account.id,
      profilePath: '/tmp/profile',
      leaseOwner: 'acceptance',
    });

    expect(result.rawResponse).toContain('<TRANSLATION>');
    expect(captured).not.toBeNull();
    const capturedPack = captured as unknown as TranslationPackDto;
    expect(capturedPack.operationType).toBe('TRANSLATE');
    expect(capturedPack.prompt).toContain(formatAiLanguageIdentity('ja'));
    expect(capturedPack.prompt).toContain(formatAiLanguageIdentity('en'));
    expect(pairFingerprint(capturedPack.sections.taskHeader)).toBe('ja→en');
    expect(capturedPack.promptHash).toBeTruthy();
  });

  it('source detection: hint ru but project source uk → Ukrainian in prompt', () => {
    const project = db.projects.create({
      title: 'Ukrainian Novel',
      source_language: 'uk',
      target_language: 'en',
      source_language_hint: 'ru',
    });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      source_text: 'Привіт',
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: 'Привіт',
    });

    const pack = getTranslationPackService().build({
      projectId: project.id,
      chapterIds: [chapter.id],
      paragraphIds: [para.paragraph_id],
    });

    expect(pack.prompt).toContain('Ukrainian');
    expect(pack.prompt).toContain('(uk)');
    expect(pack.prompt).not.toMatch(/Russian\s*\/\s*[^\n]*\(ru\)/i);
  });

  it('edition isolation: zh-Hans → vi vs zh-Hans → en packs differ; no cross-edition names', () => {
    const project = db.projects.create({
      title: 'Dual Edition',
      source_language: 'zh-Hans',
      target_language: 'vi',
    });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '王林走路。',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '王林走路。',
    });

    const viEdition = ensureDefaultEdition(db, project.id);
    const { edition: enEdition } = createEdition(db, {
      projectId: project.id,
      targetLanguage: 'en',
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
      locked: true,
    });

    const packVi = getTranslationPackService().build({
      projectId: project.id,
      chapterIds: [chapter.id],
      editionId: viEdition.id,
    });
    const packEn = getTranslationPackService().build({
      projectId: project.id,
      chapterIds: [chapter.id],
      editionId: enEdition.id,
    });

    expect(pairFingerprint(packVi.sections.taskHeader)).toBe('zh-Hans→vi');
    expect(pairFingerprint(packEn.sections.taskHeader)).toBe('zh-Hans→en');
    expect(packVi.prompt).toContain('Vương Lâm');
    expect(packVi.prompt).not.toContain('Wang Lin');
    expect(packEn.prompt).toContain('Wang Lin');
    expect(packEn.prompt).not.toContain('Vương Lâm');
  });

  it('repair ja→en without language metadata throws typed error (no zh→vi fallback)', () => {
    expect(() =>
      buildRepairPack({
        missingParagraphIds: ['[C000001:P000002]'],
        batchParagraphs: [
          { paragraphId: '[C000001:P000001]', sourceText: 'a' },
          { paragraphId: '[C000001:P000002]', sourceText: 'b' },
        ],
      } as never),
    ).toThrow(TranslationLanguagePairMissingError);

    try {
      requireRepairLanguagePair({});
    } catch (e) {
      expect((e as TranslationLanguagePairMissingError).code).toBe(
        TRANSLATION_LANGUAGE_PAIR_MISSING,
      );
    }

    const repair = buildRepairPack({
      missingParagraphIds: ['[C000001:P000002]'],
      batchParagraphs: [
        { paragraphId: '[C000001:P000001]', sourceText: '彼は走った。' },
        { paragraphId: '[C000001:P000002]', sourceText: '彼女は笑った。' },
      ],
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    expect(repair.prompt).toContain(formatAiLanguageIdentity('ja'));
    expect(repair.prompt).not.toContain('zh-Hans');
    expect(repair.prompt).not.toContain('Tiếng Việt');
  });

  it('provider fallback preserves language pair sections in pack', async () => {
    const project = db.projects.create({
      title: 'Fallback Novel',
      source_language: 'ko',
      target_language: 'vi',
    });
    const chapter = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '안녕',
      source_status: 'SOURCE_READY',
    });
    db.paragraphs.create({
      chapter_id: chapter.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '안녕',
    });

    const pack = getTranslationPackService().build({
      projectId: project.id,
      chapterIds: [chapter.id],
    });

    const captured: TranslationPackDto[] = [];
    const web = mockProvider(AI_PROVIDER_IDS.GEMINI_WEB_API, 'GEMINI_WEB_API', () =>
      Promise.resolve({
        requestId: '1',
        status: 'RATE_LIMIT',
        text: '',
      }),
    );
    const browser = mockProvider(
      AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
      'PLAYWRIGHT_GEMINI',
      (p) => {
        captured.push(p);
        return Promise.resolve({
          requestId: '2',
          status: 'SUCCESS',
          text: 'ok',
        });
      },
    );

    const manager = new AiProviderManager(db);
    manager.register(web);
    manager.register(browser);

    const result = await manager.sendWithFallback(pack, {
      projectId: project.id,
      googleAccountId: newId(),
    });

    expect(result.status).toBe('SUCCESS');
    expect(captured.length).toBe(1);
    expect(captured[0].sections.taskHeader).toBe(pack.sections.taskHeader);
    expect(captured[0].operationType).toBe(pack.operationType);
    expect(hashPrompt(captured[0].operationPrompt)).toBe(hashPrompt(pack.operationPrompt));
    expect(pairFingerprint(captured[0].sections.taskHeader)).toBe('ko→vi');
  });
});

const P1 = '[C000001:P000001]';
