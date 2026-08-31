/**
 * Phase 7 — Multi-provider release acceptance (mock integration).
 * Wires Project → Edition → Job → Scheduler → AiProviderManager.
 * Real browser smoke is manual — see docs/MULTI_PROVIDER_ACCEPTANCE.md.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER_IDS } from '@shared/constants/ai-provider';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import { planGeminiRequestRecovery } from '@main/gemini/gemini-request-recovery';
import { profileLockManager } from '@main/automation/browser-runner/profile-lock';
import { formatAiLanguageIdentity } from '@shared/constants/language-profile';
import {
  assertGoldenPairLabels,
  pairFingerprint,
} from '../helpers/golden-prompt-assertions';
import {
  createPipelineHarness,
  LOCK_PREFERRED,
  LOCK_TERM,
  mockProvider,
  okTranslateResponse,
  P1,
  P2,
  P3,
  pinProjectProvider,
  runTranslateJob,
  seedBrowserAiAccount,
  seedGoogleAccount,
  seedProject,
  waitFor,
  type PipelineHarness,
} from '../helpers/multi-provider-pipeline';

vi.mock('@main/ai/provider-preflight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/ai/provider-preflight')>();
  return { ...actual, checkProviderForJob: vi.fn() };
});

const ACCEPTANCE_PAIRS: Array<[string, string]> = [
  ['zh-Hans', 'vi'],
  ['ja', 'en'],
  ['en', 'es'],
  ['ar', 'vi'],
];

const threeParagraphBatch = [
  { paragraphId: P1, sourceText: `Alpha ${LOCK_TERM} one.` },
  { paragraphId: P2, sourceText: `Beta ${LOCK_TERM} two.` },
  { paragraphId: P3, sourceText: `Gamma ${LOCK_TERM} three.` },
];

const parser = new ResponseParser();

describe('Multi-provider acceptance — full pipeline', { timeout: 30_000 }, () => {
  let harness: PipelineHarness;

  afterEach(async () => {
    if (harness) await harness.dispose();
    vi.clearAllMocks();
  });

  describe('I. Mock integration wiring', () => {
    it(
      'captures execution target and TranslationPack through scheduler→manager',
      async () => {
      harness = await createPipelineHarness({
        buildProviders: (captures) => [
          mockProvider(
            AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
            'PLAYWRIGHT_CHATGPT',
            () =>
              Promise.resolve({
                requestId: 'r1',
                status: 'SUCCESS',
                text: okTranslateResponse([P1, P2]),
              }),
            captures,
          ),
        ],
      });
      seedBrowserAiAccount(
        harness.db,
        AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
        'acc-wire',
        'Wire ChatGPT',
      );
      const { projectId } = seedProject(harness.db, {
        title: 'Wire',
        sourceLanguage: 'ja',
        target_language: 'en',
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

      const jobId = await runTranslateJob(harness, {
        projectId,
        batchParagraphs: [
          { paragraphId: P1, sourceText: '彼は走った。' },
          { paragraphId: P2, sourceText: '彼女は笑った。' },
        ],
        sourceParagraphIds: [P1, P2],
      });

      expect(harness.captures.executionTargets.length).toBeGreaterThan(0);
      expect(harness.captures.executionTargets[0]?.providerId).toBe(
        AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
      );
      expect(harness.captures.executionTargets[0]?.accountKind).toBe('AI_ACCOUNT');

      const pack = harness.captures.packs[0];
      expect(pack).toBeDefined();
      expect(pack!.operationType).toBe('TRANSLATE');
      expect(pack!.prompt).toContain(formatAiLanguageIdentity('ja'));
      expect(pack!.prompt).toContain(formatAiLanguageIdentity('en'));
      expect(pack!.promptHash).toBeTruthy();

      const job = harness.db.jobs.getById(jobId);
      expect(job?.execution_provider_id).toBe(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
      expect(job?.execution_account_kind).toBe('AI_ACCOUNT');
    },
    30_000,
    );
  });

  describe('II. Provider cases', () => {
    const cases = [
      {
        label: 'Gemini only',
        setup: (h: PipelineHarness, projectId: string) => {
          seedGoogleAccount(h.db, 'gem-only', 'gem-only-prof');
          pinProjectProvider(h.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI);
        },
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI,
        providerType: 'PLAYWRIGHT_GEMINI' as const,
        accountKind: 'GOOGLE_ACCOUNT' as const,
      },
      {
        label: 'ChatGPT only',
        setup: (h: PipelineHarness, projectId: string) => {
          seedBrowserAiAccount(h.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-only', 'CGPT');
          pinProjectProvider(h.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
        },
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT,
        providerType: 'PLAYWRIGHT_CHATGPT' as const,
        accountKind: 'AI_ACCOUNT' as const,
      },
      {
        label: 'Meta only',
        setup: (h: PipelineHarness, projectId: string) => {
          seedBrowserAiAccount(h.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'meta-only', 'Meta');
          pinProjectProvider(h.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);
        },
        providerId: AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
        providerType: 'PLAYWRIGHT_META_AI' as const,
        accountKind: 'AI_ACCOUNT' as const,
      },
    ];

    for (const c of cases) {
      it(`${c.label} completes through shared pipeline`, async () => {
        harness = await createPipelineHarness({
          buildProviders: (captures) => [
            mockProvider(c.providerId, c.providerType, () =>
              Promise.resolve({
                requestId: 'ok',
                status: 'SUCCESS',
                text: okTranslateResponse([P1, P2]),
              }), captures),
          ],
        });
        const { projectId } = seedProject(harness.db, {
          title: c.label,
          sourceLanguage: 'zh-Hans',
          target_language: 'vi',
        });
        c.setup(harness, projectId);

        await runTranslateJob(harness, {
          projectId,
          batchParagraphs: [
            { paragraphId: P1, sourceText: '第一段' },
            { paragraphId: P2, sourceText: '第二段' },
          ],
          sourceParagraphIds: [P1, P2],
        });

        expect(harness.captures.executionTargets[0]?.providerId).toBe(c.providerId);
        expect(harness.captures.executionTargets[0]?.accountKind).toBe(c.accountKind);
      });
    }

    it('Gemini + ChatGPT + Meta — each pinned project uses its provider', async () => {
      harness = await createPipelineHarness({
        maxConcurrentWorkers: 3,
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, 'PLAYWRIGHT_GEMINI', () =>
            Promise.resolve({ requestId: 'g', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) }), captures),
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', () =>
            Promise.resolve({ requestId: 'c', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) }), captures),
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'PLAYWRIGHT_META_AI', () =>
            Promise.resolve({ requestId: 'm', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) }), captures),
        ],
      });

      seedGoogleAccount(harness.db, 'all-gem', 'all-gem-p');
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'all-c', 'C');
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'all-m', 'M');

      const pGem = seedProject(harness.db, { title: 'G', sourceLanguage: 'zh-Hans', target_language: 'vi' }).projectId;
      const pChat = seedProject(harness.db, { title: 'C', sourceLanguage: 'zh-Hans', target_language: 'vi' }).projectId;
      const pMeta = seedProject(harness.db, { title: 'M', sourceLanguage: 'zh-Hans', target_language: 'vi' }).projectId;
      pinProjectProvider(harness.db, pGem, AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI);
      pinProjectProvider(harness.db, pChat, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
      pinProjectProvider(harness.db, pMeta, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);

      harness.scheduler.start();
      const batch = [{ paragraphId: P1, sourceText: 'a' }, { paragraphId: P2, sourceText: 'b' }];
      const j1 = harness.service.enqueueTranslate({
        projectId: pGem, chapterFrom: 1, chapterTo: 1, sourceParagraphIds: [P1, P2], batchParagraphs: batch,
      }).job;
      const j2 = harness.service.enqueueTranslate({
        projectId: pChat, chapterFrom: 1, chapterTo: 1, sourceParagraphIds: [P1, P2], batchParagraphs: batch,
      }).job;
      const j3 = harness.service.enqueueTranslate({
        projectId: pMeta, chapterFrom: 1, chapterTo: 1, sourceParagraphIds: [P1, P2], batchParagraphs: batch,
      }).job;

      await waitFor(
        () =>
          harness.db.jobs.getById(j1.id)?.state === 'COMPLETED' &&
          harness.db.jobs.getById(j2.id)?.state === 'COMPLETED' &&
          harness.db.jobs.getById(j3.id)?.state === 'COMPLETED',
      );

      const providers = harness.captures.executionTargets.map((t) => t.providerId);
      expect(providers).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI);
      expect(providers).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
      expect(providers).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);
    });
  });

  describe('III. Zero Google', () => {
    it('ChatGPT READY, zero Google → synthetic chapter PASS', async () => {
      harness = await createPipelineHarness({
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', () =>
            Promise.resolve({ requestId: 'z1', status: 'SUCCESS', text: okTranslateResponse([P1, P2, P3]) }), captures),
        ],
      });
      expect(harness.db.googleAccounts.list().length).toBe(0);
      const chatId = seedBrowserAiAccount(
        harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'zero-g-cgpt', 'Zero ChatGPT',
      );
      const { projectId } = seedProject(harness.db, {
        title: 'Zero Google ChatGPT', sourceLanguage: 'en', target_language: 'vi',
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

      await runTranslateJob(harness, {
        projectId, batchParagraphs: threeParagraphBatch, sourceParagraphIds: [P1, P2, P3],
      });

      expect(harness.db.jobs.listAll()[0]?.execution_account_id).toBe(chatId);
      expect(harness.db.googleAccounts.list().length).toBe(0);
    });

    it('Meta READY, zero Google → synthetic chapter PASS', async () => {
      harness = await createPipelineHarness({
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'PLAYWRIGHT_META_AI', () =>
            Promise.resolve({ requestId: 'z2', status: 'SUCCESS', text: okTranslateResponse([P1, P2, P3]) }), captures),
        ],
      });
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'zero-g-meta', 'Zero Meta');
      const { projectId } = seedProject(harness.db, {
        title: 'Zero Google Meta', sourceLanguage: 'en', target_language: 'vi',
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);

      await runTranslateJob(harness, {
        projectId, batchParagraphs: threeParagraphBatch, sourceParagraphIds: [P1, P2, P3],
      });

      expect(harness.db.jobs.listAll()[0]?.execution_provider_id).toBe(
        AI_PROVIDER_IDS.PLAYWRIGHT_META_AI,
      );
    });
  });

  describe('IV–V. Multi-account and cross-provider concurrency', () => {
    it('2 ChatGPT accounts → 2 parallel jobs on different projects', async () => {
      harness = await createPipelineHarness({
        maxConcurrentWorkers: 2,
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', async () => {
            await new Promise((r) => setTimeout(r, 30));
            return { requestId: 'p', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) };
          }, captures),
        ],
      });
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-a', 'A');
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cgpt-b', 'B');
      const p1 = seedProject(harness.db, { title: 'P1', sourceLanguage: 'en', target_language: 'vi' }).projectId;
      const p2 = seedProject(harness.db, { title: 'P2', sourceLanguage: 'en', target_language: 'vi' }).projectId;
      pinProjectProvider(harness.db, p1, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
      pinProjectProvider(harness.db, p2, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

      harness.scheduler.start();
      const batch = [{ paragraphId: P1, sourceText: 'a' }, { paragraphId: P2, sourceText: 'b' }];
      harness.service.enqueueTranslate({ projectId: p1, chapterFrom: 1, chapterTo: 1, sourceParagraphIds: [P1, P2], batchParagraphs: batch });
      harness.service.enqueueTranslate({ projectId: p2, chapterFrom: 1, chapterTo: 1, sourceParagraphIds: [P1, P2], batchParagraphs: batch });

      await waitFor(() => harness.captures.executionTargets.length === 2);
      expect(new Set(harness.captures.executionTargets.map((t) => t.accountId)).size).toBe(2);
    });

    it('Gemini + ChatGPT + Meta run concurrently without profile lock leak', async () => {
      harness = await createPipelineHarness({
        maxConcurrentWorkers: 3,
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI, 'PLAYWRIGHT_GEMINI', async () => {
            await new Promise((r) => setTimeout(r, 20));
            return { requestId: 'g', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) };
          }, captures),
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', async () => {
            await new Promise((r) => setTimeout(r, 20));
            return { requestId: 'c', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) };
          }, captures),
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'PLAYWRIGHT_META_AI', async () => {
            await new Promise((r) => setTimeout(r, 20));
            return { requestId: 'm', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) };
          }, captures),
        ],
      });
      seedGoogleAccount(harness.db, 'cross-g', 'cross-g-p');
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'cross-c', 'C');
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'cross-m', 'M');

      const projects = [
        { id: seedProject(harness.db, { title: 'GA', sourceLanguage: 'ja', target_language: 'en' }).projectId, prov: AI_PROVIDER_IDS.PLAYWRIGHT_GEMINI },
        { id: seedProject(harness.db, { title: 'CB', sourceLanguage: 'ja', target_language: 'en' }).projectId, prov: AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT },
        { id: seedProject(harness.db, { title: 'MC', sourceLanguage: 'ja', target_language: 'en' }).projectId, prov: AI_PROVIDER_IDS.PLAYWRIGHT_META_AI },
      ];
      for (const p of projects) pinProjectProvider(harness.db, p.id, p.prov);

      harness.scheduler.start();
      const batch = [{ paragraphId: P1, sourceText: 'a' }, { paragraphId: P2, sourceText: 'b' }];
      for (const p of projects) {
        harness.service.enqueueTranslate({
          projectId: p.id, chapterFrom: 1, chapterTo: 1, sourceParagraphIds: [P1, P2], batchParagraphs: batch,
        });
      }

      await waitFor(() => harness.captures.executionTargets.length === 3);
      expect(new Set(harness.captures.executionTargets.map((t) => t.concurrencyKey)).size).toBe(3);
      await harness.scheduler.stop({ waitMs: 2_000 });
      expect(profileLockManager.listActiveLeases().length).toBe(0);
    });
  });

  describe('VII. Translation protocol', () => {
    it('3 paragraphs, stable IDs, locked term — parser PASS + QA PASS', async () => {
      harness = await createPipelineHarness({
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', () =>
            Promise.resolve({
              requestId: 'proto',
              status: 'SUCCESS',
              text: okTranslateResponse([P1, P2, P3], [
                `One ${LOCK_PREFERRED}.`, `Two ${LOCK_PREFERRED}.`, `Three ${LOCK_PREFERRED}.`,
              ]),
            }), captures),
        ],
      });
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'proto', 'Proto');
      const { projectId } = seedProject(harness.db, {
        title: 'Protocol', sourceLanguage: 'en', target_language: 'vi',
        lockedTerm: { source: LOCK_TERM, preferred: LOCK_PREFERRED },
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

      await runTranslateJob(harness, {
        projectId,
        batchParagraphs: threeParagraphBatch,
        sourceParagraphIds: [P1, P2, P3],
        lockedTerms: [{ source: LOCK_TERM, preferred: LOCK_PREFERRED }],
      });

      const raw = okTranslateResponse([P1, P2, P3], [
        `One ${LOCK_PREFERRED}.`, `Two ${LOCK_PREFERRED}.`, `Three ${LOCK_PREFERRED}.`,
      ]);
      const parsed = parser.parse(raw);
      expect(parsed.status).toBe('ok');
      expect(parsed.translations.map((t) => t.paragraphId).sort()).toEqual([P1, P2, P3].sort());

      const qa = runLocalQa({
        parsed,
        sourceParagraphIds: [P1, P2, P3],
        sourceParagraphs: threeParagraphBatch,
        lockedTerms: [{ source: LOCK_TERM, preferred: LOCK_PREFERRED }],
        targetLanguage: 'vi',
      });
      expect(qa.passed).toBe(true);
    });
  });

  describe('VIII. Multilingual — provider does not change language policy', () => {
    for (const [source, target] of ACCEPTANCE_PAIRS) {
      it(`${source}→${target} on ChatGPT path`, async () => {
        harness = await createPipelineHarness({
          buildProviders: (captures) => [
            mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', () =>
              Promise.resolve({ requestId: 'ml', status: 'SUCCESS', text: okTranslateResponse([P1]) }), captures),
          ],
        });
        seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, `ml-${source}`, 'ML');
        const { projectId } = seedProject(harness.db, {
          title: `ML ${source}`, sourceLanguage: source, target_language: target,
        });
        pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

        await runTranslateJob(harness, {
          projectId,
          batchParagraphs: [{ paragraphId: P1, sourceText: 'sample' }],
          sourceParagraphIds: [P1],
        });

        const pack = harness.captures.packs[0]!;
        assertGoldenPairLabels(pack.prompt, source, target);
        expect(pairFingerprint(pack.sections.taskHeader)).toBe(`${source}→${target}`);
      });
    }
  });

  describe('IX. Long chapter adaptive chunks', () => {
    it('ChatGPT splits oversized source into multiple sends', async () => {
      const longPara = 'x'.repeat(15_000);
      const ids = [
        '[C000001:P000001]',
        '[C000001:P000002]',
        '[C000001:P000003]',
      ];
      harness = await createPipelineHarness({
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', (_pack, _opts) => {
            const n = (captures.sendCounts.get(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT) ?? 0) + 1;
            const chunkIds = n === 1 ? ids.slice(0, 2) : ids.slice(2);
            return Promise.resolve({
              requestId: `chunk-${n}`,
              status: 'SUCCESS',
              text: okTranslateResponse(chunkIds),
            });
          }, captures),
        ],
      });
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'long', 'Long');
      const { projectId } = seedProject(harness.db, {
        title: 'Long', sourceLanguage: 'en', target_language: 'vi',
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

      const batch = ids.map((id) => ({ paragraphId: id, sourceText: longPara }));

      harness.scheduler.start();
      harness.service.enqueueTranslate({
        projectId,
        chapterFrom: 1,
        chapterTo: 1,
        sourceParagraphIds: ids,
        batchParagraphs: batch,
      });
      await waitFor(
        () => (harness.captures.sendCounts.get(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT) ?? 0) > 1,
        20_000,
      );
    });
  });

  describe('X. Repair', () => {
    it('missing paragraph repaired through same provider; language pair preserved', async () => {
      let call = 0;
      harness = await createPipelineHarness({
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'PLAYWRIGHT_META_AI', () => {
            call += 1;
            if (call === 1) {
              return Promise.resolve({
                requestId: 'init',
                status: 'SUCCESS',
                text: [
                  '<TRANSLATION>',
                  `${P1} One ${LOCK_PREFERRED}.`,
                  `${P2} Two ${LOCK_PREFERRED}.`,
                  '</TRANSLATION>',
                  '<TERM_DELTA>[]</TERM_DELTA>',
                  '<MEMORY_DELTA>[]</MEMORY_DELTA>',
                ].join('\n'),
              });
            }
            return Promise.resolve({
              requestId: 'repair',
              status: 'SUCCESS',
              text: okTranslateResponse([P3], [`Three ${LOCK_PREFERRED}.`]),
            });
          }, captures),
        ],
      });
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'repair', 'Repair');
      const { projectId } = seedProject(harness.db, {
        title: 'Repair', sourceLanguage: 'ja', target_language: 'en',
        lockedTerm: { source: LOCK_TERM, preferred: LOCK_PREFERRED },
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);

      await runTranslateJob(harness, {
        projectId,
        batchParagraphs: threeParagraphBatch,
        sourceParagraphIds: [P1, P2, P3],
        lockedTerms: [{ source: LOCK_TERM, preferred: LOCK_PREFERRED }],
      });

      expect(call).toBeGreaterThanOrEqual(2);
      const repairPack = harness.captures.packs.find((p) => p.operationType === 'REPAIR');
      if (repairPack) {
        expect(repairPack.prompt).toContain(formatAiLanguageIdentity('ja'));
        expect(repairPack.prompt).toContain(formatAiLanguageIdentity('en'));
      }
    });
  });

  describe('XI. Fallback', () => {
    it('ChatGPT TIMEOUT → Meta SUCCESS', async () => {
      harness = await createPipelineHarness({
        routingMode: 'AUTO',
        buildProviders: (captures) => [
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'PLAYWRIGHT_CHATGPT', () =>
            Promise.resolve({ requestId: 't', status: 'TIMEOUT', text: '' }), captures),
          mockProvider(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'PLAYWRIGHT_META_AI', () =>
            Promise.resolve({ requestId: 'm', status: 'SUCCESS', text: okTranslateResponse([P1, P2]) }), captures),
        ],
      });
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT, 'fb-c', 'FB-C');
      seedBrowserAiAccount(harness.db, AI_PROVIDER_IDS.PLAYWRIGHT_META_AI, 'fb-m', 'FB-M');
      const { projectId } = seedProject(harness.db, {
        title: 'Fallback', sourceLanguage: 'en', target_language: 'vi',
      });
      pinProjectProvider(harness.db, projectId, AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);

      await runTranslateJob(harness, {
        projectId,
        batchParagraphs: [{ paragraphId: P1, sourceText: 'a' }, { paragraphId: P2, sourceText: 'b' }],
        sourceParagraphIds: [P1, P2],
      });

      expect(harness.captures.providerIds).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_CHATGPT);
      expect(harness.captures.providerIds).toContain(AI_PROVIDER_IDS.PLAYWRIGHT_META_AI);
    });
  });

  describe('XII. Duplicate safety (crash planner)', () => {
    it('UNKNOWN_AFTER_CRASH with marker found → no resend', () => {
      const action = planGeminiRequestRecovery('UNKNOWN_AFTER_CRASH', {
        markerFound: true,
        generationActive: false,
        responseComplete: true,
        rawCaptured: false,
        parsed: false,
      });
      expect(action.action).not.toBe('resend');
    });

    it('SENT_CONFIRMED with marker → wait_generation, no resend', () => {
      const action = planGeminiRequestRecovery('SENT_CONFIRMED', {
        markerFound: true,
        generationActive: true,
        responseComplete: false,
        rawCaptured: false,
        parsed: false,
      });
      expect(action.action).toBe('wait_generation');
    });
  });
});
