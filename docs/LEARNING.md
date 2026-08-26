# Learning Pipeline (Phase 16)

After translation QA **PASS** / **PASS_WITH_WARNINGS**, ingest deltas and keep project memory compact.

## TERM_DELTA

| Action | Behavior |
|--------|----------|
| `discover` | **Candidate only** (never `GLOBAL_VERIFIED`). Duplicate source → merge frequency / occurrence |
| `update` | Soft update if unlocked candidate/discovered; locked/global → candidate suggestion only |
| `confirm` | **PROJECT_VERIFIED** max + occurrence + `human_confirm_count` — **never GLOBAL** |

Occurrence records: project, chapter, source context. Updates `occurrence_count` + `project_count`.

### Confidence

Adjusted from: repeated appearance, human confirms, project confirms.  
Ceiling for AI-driven status: **0.85**.  
**AI cannot set `GLOBAL_VERIFIED`.** Human promote (Terms UI / `term:review`) only.

## MEMORY_DELTA

Reuse `applyMemoryDelta`: validate → apply non-conflicting; conflicts → **Memory Conflict Queue**.

## Every N chapters

Configurable via Drive sync schedule (`sync_every_n_chapters`, default 10).

1. Compact/archive historical memory if needed  
2. Build consolidated markdown: `01_PROJECT_TERMS.md`, `02_CHARACTERS.md`, `03_RELATIONSHIPS.md`, `04_STORY_STATE.md`  
3. Drive sync (errors logged; job still COMPLETED)

## Compact state

`memory_archives` stores historical events / oversized story summaries. Active `memory_events` + story state stay bounded.

## UI

**Learning** page: new terms, conflicts, promotions/activity, recent memories.

## Key paths

- `src/main/learning/learning-pipeline.ts`
- `src/main/learning/term-delta-processor.ts`
- `src/main/learning/memory-compactor.ts`
- Hook: `repair-loop.ts` after PASS
- Migration **012**

## Tests

`tests/unit/learning/learning-pipeline.test.ts`
