# Multilingual Prompt Acceptance (Phase 8)

Offline acceptance for production multilingual prompt wiring. **Not** translation-quality certification.

**Last gate run:** 2026-08-29 — `115` tests PASS (`golden-prompt-matrix`, `golden-prompt-operations`, `multilingual-production-acceptance`, `multilingual-acceptance-smoke`).

## Production builders (verified path)

| Stage | Module | Role |
| --- | --- | --- |
| Policy resolution | `src/shared/constants/translation-prompt-policy/resolver.ts` | Layers A–G → `rules[]` |
| Task header | `src/shared/constants/translation-style-model.ts` | `formatTranslationTaskHeader` |
| Translate pack | `src/main/prompt/translation-pack-builder.ts` | `assemblePackSections` / `buildTranslationPack` |
| Pack service | `src/main/services/translation-pack-service.ts` | `TranslationPackService.build` |
| Job → provider | `src/main/ai/ai-provider-manager.ts` | `sendForJob` / `sendWithFallback` |
| Bootstrap | `src/main/bootstrap/bootstrap-prompt-builder.ts` | analyze-only bootstrap |
| Preprocess | `src/main/bootstrap/full-novel-preprocess-prompts.ts` | NotebookLM 8-file flow |
| Repair | `src/main/jobs/repair-pack-builder.ts` + `repair-strategies.ts` | REPAIR / continuation / deltas |
| Continuation | `src/main/jobs/continuation.ts` | `buildContinuationPrompt` |
| Parser | `src/main/jobs/response-parser.ts` | `ResponseParser` |
| Local QA | `src/main/jobs/qa-checker.ts` + `qa-language-aware.ts` | structural + language-aware |

Language pair is **never** taken from job JSON alone. Resolved via `resolveForProjectEdition` (`project.source_language` + edition `target_language`).

## Policy layers (reference)

| Layer | Source |
| --- | --- |
| A Universal | `universal-contract.ts` |
| B Source | `source-policies.ts` |
| C Target | `target-policies.ts` |
| D Script / typography | `script-typography.ts` |
| E Style / fidelity / genre | `translation-style-model.ts` |
| F Project / edition rules | pack input |
| G Pair overrides | `pair-overrides.ts` |

Golden matrix asserts identity lines, canonical BCP-47 codes, layer content, and negative static rules (e.g. ja→en has no Hán-Việt / zh→vi hardcode; ar→fr has no Vietnamese/English target instructions).

## Golden language pairs (TRANSLATE pack)

Snapshots: `tests/unit/language/__snapshots__/golden-prompt-matrix.test.ts.snap`

Prompt fingerprint: `pairFingerprint()` on task header — `Source language:` / `Target language:` lines with `(code)`.

| Pair | Builder | Policy layers | Fingerprint | Parser | QA (synthetic) | Provider | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| zh-Hans → vi | `assemblePackSections` | A–G | zh-Hans→vi | — | — | — | **PASS** |
| zh-Hant → en |同上 | A–G | zh-Hant→en | — | — | — | **PASS** |
| ja → vi |同上 | A–G | ja→vi | — | — | — | **PASS** |
| ja → en |同上 | A–G | ja→en | — | — | — | **PASS** |
| ko → vi |同上 | A–G | ko→vi | — | — | — | **PASS** |
| ko → en |同上 | A–G | ko→en | — | — | — | **PASS** |
| en → vi |同上 | A–G | en→vi | — | — | — | **PASS** |
| en → es |同上 | A–G | en→es | — | — | — | **PASS** |
| fr → de |同上 | A–G | fr→de | — | — | — | **PASS** |
| de → fr |同上 | A–G | de→fr | — | — | — | **PASS** |
| ru → vi |同上 | A–G | ru→vi | — | — | — | **PASS** |
| uk → en |同上 | A–G | uk→en | — | — | — | **PASS** |
| ar → vi |同上 | A–G | ar→vi | — | — | — | **PASS** |
| fa → en |同上 | A–G | fa→en | — | — | — | **PASS** |
| ur → vi |同上 | A–G | ur→vi | — | — | — | **PASS** |
| hi → en |同上 | A–G | hi→en | — | — | — | **PASS** |
| th → vi |同上 | A–G | th→vi | — | — | — | **PASS** |
| id → en |同上 | A–G | id→en | — | — | — | **PASS** |

## Prompt operations (representative pairs)

Test: `tests/unit/language/golden-prompt-operations.test.ts`

Pairs: ja→en, zh-Hans→vi, ar→fr.

| Operation | Builder | Pair preserved | Result |
| --- | --- | --- | --- |
| TRANSLATE | `assemblePackSections` | yes | **PASS** |
| BOOTSTRAP | `buildBootstrapAnalysisPrompt` | yes (18 pairs in matrix) | **PASS** |
| REPAIR | `buildRepairPack` | yes | **PASS** |
| CONTINUATION | `buildContinuationPrompt` | yes | **PASS** |
| TERM_VIOLATION | `buildRepairPlan` (`term_violation`) | yes | **PASS** |
| MALFORMED_OUTPUT | `buildRepairPlan` (`malformed_full`) | yes | **PASS** |
| DELTA_ONLY | `buildRepairPlan` (`deltas_only`) | yes | **PASS** |

## Production wiring (integration)

Test: `tests/integration/multilingual-production-acceptance.test.ts`

| Scenario | Path | Provider | Result |
| --- | --- | --- | --- |
| Job → pack capture | Project → Edition → Job → `AiProviderManager.sendForJob` → mock `IAIProvider` | `GEMINI_WEB_API` mock | **PASS** — `operationType=TRANSLATE`, `ja→en` header, `promptHash` set |
| Source detection | hint `ru`, resolved `uk` | `TranslationPackService.build` | **PASS** — Ukrainian `(uk)` in prompt, not Russian |
| Edition isolation | zh-Hans → vi vs en editions, locked terms | `TranslationPackService.build` | **PASS** — no cross-edition preferred names |
| Repair without pair | `buildRepairPack` / `requireRepairLanguagePair` | — | **PASS** — `TranslationLanguagePairMissingError`, no zh→vi fallback |
| Provider fallback | Web `RATE_LIMIT` → Playwright | `sendWithFallback` | **PASS** — `taskHeader`, `operationType`, `hashPrompt(operationPrompt)` unchanged |

**Bug fixed during acceptance:** `loadTermsForPack` now filters vault terms by **edition** target language (`context-selector.ts`), not only `project.target_language`.

## Synthetic smoke (parser + QA + pack header)

Test: `tests/google-smoke/multilingual-acceptance-smoke.test.ts`

| Pair | Parser IDs | QA verdict | Locked term | Source leakage | Result |
| --- | --- | --- | --- | --- | --- |
| ja → en | 3/3 | PASS | preserved | none | **PASS** |
| en → vi | 3/3 | PASS | preserved | none | **PASS** |
| uk → en | 3/3 | PASS | preserved | none | **PASS** |
| ar → vi | 3/3 | PASS | preserved | none | **PASS** |
| fa → en | 3/3 | PASS | preserved | none | **PASS** |

## Live Gemini smoke (developer-only)

**Not run in CI.** Opt-in:

```bash
KHEPREE_NOVEL_AI_MULTILINGUAL_SMOKE=1 npm run test:google-smoke
```

Uses copyright-safe synthetic paragraphs (3 per pair), stable paragraph IDs, one locked term per pair. Asserts IDs, target-language signals, locked-term preservation, no obvious source leakage.

**Label:** operational smoke only — **not** “translation quality certified”.

## Prompt hash convention

Integration tests compare semantic stability via:

- `TranslationPackDto.promptHash` (production pack)
- `hashPrompt(operationPrompt)` — first 16 hex chars of SHA-256 (`repair-loop.ts`)

Full rendered prompts are snapshotted under `tests/unit/language/__snapshots__/`.

## Release blocker checklist

Multilingual production-ready **only if**:

| Gate | Status |
| --- | --- |
| All golden prompt matrix tests (18 pairs × header/pack/bootstrap/preprocess) | **PASS** |
| All operation types preserve pair (representative matrix) | **PASS** |
| Negative static assertions (ja→en, ar→fr) | **PASS** |
| Production-call capture (`sendForJob` → `IAIProvider`) | **PASS** |
| Source detection (hint ≠ resolved source) | **PASS** |
| Edition term isolation | **PASS** |
| Repair / continuation without silent language fallback | **PASS** |
| Provider fallback preserves language + operation sections | **PASS** |
| Synthetic parser + QA smoke | **PASS** |
| Live Gemini smoke (optional pre-release) | **MANUAL** |

**Offline acceptance:** **PASS** (all automated gates above except live smoke).

## Running locally

```bash
npm rebuild better-sqlite3
npx vitest run tests/unit/language/golden-prompt-matrix.test.ts
npx vitest run tests/unit/language/golden-prompt-operations.test.ts
npx vitest run tests/integration/multilingual-production-acceptance.test.ts
npx vitest run tests/google-smoke/multilingual-acceptance-smoke.test.ts
```
