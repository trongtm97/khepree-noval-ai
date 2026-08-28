# Prompt Production Wiring Audit

**Date:** 2026-08-29  
**Priority:** P0 — Multilingual Prompt System Phase 1  
**Method:** Static call-graph trace + source scan

## Summary

Canonical production path resolves **source** from detected `projects.source_language` (never hint) and **target** from **Translation Edition** via `TranslationLanguageResolver.resolveForProjectEdition()`.  
Default translation pack mode is `LOCAL_CONTEXT`; Notebook does not gate prompt language or pack readiness.

| Prompt Type | Entry Point | Builder | Source Language Source | Target Language Source | Hardcode Found | Production? | Action |
|-------------|-------------|---------|------------------------|------------------------|----------------|---------------|--------|
| Translation (job send) | `AiProviderManager.executeJob` → `buildPackForJob` | `TranslationPackService.build` → `buildTranslationPack` | `resolveForProjectEdition` → `projects.source_language` | Edition `target_language` | None in builder header | Yes | **DONE** — `formatTranslationTaskHeader` |
| Repair (missing/empty/corrupt) | `repair-loop` → `buildRepairPlan` | `buildRepairPack` | Resolver in `repair-loop` before plan | Edition via resolver | None — `formatLanguagePairPreamble` | Yes | **DONE** — required pair |
| Continuation (tail) | `runContinuationLoop` / `outputIncompleteStrategy` | `buildContinuationPrompt` | Caller passes resolver pair | Edition via resolver | None | Yes | **DONE** — required pair |
| Delta repair (TERM/MEMORY JSON) | `memoryJsonInvalidStrategy` | Inline deltas prompt | N/A (no translation) | N/A | None | Yes | **KEEP** |
| QA repair (term violation) | `termViolationStrategy` | `buildRepairPack` + locked hints | Resolver pair | Edition via resolver | None | Yes | **DONE** |
| Bootstrap analysis | `BootstrapAnalysisService.run` | `buildBootstrapAnalysisPrompt` | `prepareBootstrapLocal` → resolver | Edition via resolver | None — `preferred_target` in JSON schema | Yes | **DONE** |
| FULL Research preprocess | `full-novel-preprocess-orchestrator` | `buildFullNovelPreprocessPrompt` | Project row (caller should use resolver) | Edition / project target | None — dynamic `displayNameNative` | Yes (Research) | **KEEP** |
| FULL Research query | `queryResearchNotebook` | Inline Vietnamese operator prompt | N/A (lookup, not translate) | N/A | No zh→vi pair | Yes (Research) | **KEEP** — not translation path |

## Call graph (translation job)

```
Job scheduler / batch-executor
  → AiProviderManager.executeJob / sendWithFallback
    → buildPackForJob (editionId from job)
      → TranslationPackService.build
        → resolveForProjectEdition
        → MemoryService.buildContext (ContextSelector + SQLite)
        → buildTranslationPack (explicit sourceLanguage / targetLanguage)
    → provider.sendPrompt(pack)
  → runRepairLoop (on QA fail)
    → resolveForProjectEdition (job edition)
    → buildRepairPlan → buildRepairPack / buildContinuationPrompt
    → sendRepairOrContinuation
  → finalizeChunkWithContinuation
    → resolveForProjectEdition
    → runContinuationLoop → buildContinuationPrompt
```

## Legacy fallback policy

| Context | zh-Hans → vi default allowed? |
|---------|------------------------------|
| DB migration (`027-language-profiles`, `031-translation-editions`) | Yes |
| `LEGACY_IMPORT` project with empty source at runtime | Yes (resolver) |
| Modern `FOLDER` project missing source/target | **No** — `TRANSLATION_LANGUAGE_PAIR_MISSING` |
| Production builder `?? DEFAULT_SOURCE_LANGUAGE` | **Removed** |

## Static guards

- `tests/unit/regression/no-zh-vi-hardcode-literals.test.ts` — bans `Translate Chinese → Vietnamese`, `Chinese→Vietnamese novel translation project`, `preferred_vi`, `into Vietnamese` in `src/` (allowlist: `schemas/bootstrap.ts`, smoke harnesses).
- `tests/unit/language/prompt-language-pairs.test.ts` — matrix: zh-Hans→vi, ja→en, ko→vi, en→es, fr→de, ar→vi, fa→en, uk→pl (+ regression pairs).
- `tests/unit/services/translation-language-resolver.test.ts` — resolver + legacy vs modern errors.

## Residual / out of scope

- UI i18n marketing copy (`renderer/i18n`) — product strings, not AI prompts.
- `google-smoke` / `notebook-grounding-smoke` — opt-in harnesses, allowlisted.
- `preferred_vi` in `schemas/bootstrap.ts` — legacy JSON ingest adapter only.
- Research NotebookLM corpus upload — intentional separate path.

## Hardening this pass

1. Added `TranslationLanguageResolver` + `TRANSLATION_LANGUAGE_PAIR_MISSING`.
2. Removed `DEFAULT_SOURCE_LANGUAGE` / `DEFAULT_TARGET_LANGUAGE` runtime fallbacks from pack/repair/continuation builders.
3. `TranslationPackService` default `LOCAL_CONTEXT`; removed Notebook-driven pack mode resolution on job send.
4. Repair loop resolves edition target before `buildRepairPlan`.
5. **Phase 2:** `TranslationPromptPolicyResolver` — layered policy (universal → fidelity → genre → source → target → typography → pair → project → edition); source/target split; FANTASY rule no longer references Notebook.
