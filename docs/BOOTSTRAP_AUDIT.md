# Bootstrap / Memory / Notebook — Pre-change Audit

Audit date: 2026-08-25. Based on live code under `src/`, not aspirational docs alone.

| Requirement | Current Implementation | Status | Fix Needed |
|-------------|------------------------|--------|------------|
| SQLite SoT; MD regenerate from DB | `NotebookKnowledgeBuilder.rebuildAndTrack`; docs `NOTEBOOK_ARCHITECTURE.md` | PASS | — |
| 8 knowledge files 00–07; empty/placeholder OK | `KNOWLEDGE_FILE_NAMES` + builder placeholders | PASS | Soften empty copy in UI |
| Translate not blocked by empty chars/rels | `evaluateTranslatePreflight` (worker/channel only) | PASS | — |
| Recent context rolling window | `recentContextChapters: 20` + `getRecentMemory` | PASS | — |
| Story state = snapshot; events = history | `story_states` patch + `memory_events` | PASS | — |
| Hot memory before Notebook sync | `notebook_hot_deltas` in pack builder | PASS | — |
| Learning after QA PASS | `repair-loop` → `runLearningPipeline` | PARTIAL | Multi-chunk wipe |
| Local seed (metadata + early chapters) | `NotebookBootstrapService.seedFromMetadataAndEarlyChapters` | PARTIAL | Default 3 ch; no vault match; no AI |
| One-shot Bootstrap AI (DO NOT TRANSLATE) | Orphaned `buildSeedResearchPrompt` / `applySeedResearchJson` | NOT_IMPLEMENTED | `BootstrapAnalysisService` |
| `bootstrap_status` + version + through_chapter | Absent on `projects` | NOT_IMPLEMENTED | Migration 018 |
| Wizard Skip / Analyze after import | `CreateProjectWizard` ends without memory step | NOT_IMPLEMENTED | Wizard step |
| ContextSelector temporal filter | Rels: `listActiveAtChapter`; chars/terms leak | PARTIAL | Filter by chapter |
| Crash recovery for bootstrap | Sync events only | NOT_IMPLEMENTED | Status + resume |
| Multi-chunk keep TERM/MEMORY deltas | `buildMergedTranslationProtocol` hardcodes `[]` | FAIL | Accumulate + merge |
| `seedChapterCount` default 10 | `DEFAULT_NOTEBOOK_SETTINGS.seedChapterCount = 3` | FAIL | Default 10 + budget |
| Term vault match before AI bootstrap | Not in seed path | NOT_IMPLEMENTED | Local prep |
| Future leakage prevention | Weak | PARTIAL | Selector + no-spoiler rule |
| Help article bootstrap memory | Partial notebook help only | PARTIAL | Dedicated article |

## Modules present

- `src/main/notebook/notebook-bootstrap-service.ts`
- `src/main/notebook/knowledge-builder.ts`
- `src/main/memory/context-selector.ts`
- `src/main/learning/learning-pipeline.ts`
- `src/main/notebook/notebook-sync-service.ts`

## Top blockers

1. Multi-chunk delta wipe → empty Characters/Terms after translate.
2. No BootstrapAnalysisService (one AI analyze call).
3. No `bootstrap_status` lifecycle on project.
4. Default seed 3 chapters; no adaptive budget.
5. No create-project bootstrap wizard / skip.
