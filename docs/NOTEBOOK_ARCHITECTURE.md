# Notebook Architecture

## Roles

| Layer | Role |
|-------|------|
| **SQLite** | Source of truth — chapters, translations, terms, characters, relationships, story state, jobs, QA |
| **NotebookLM** | AI knowledge layer — compact markdown Gemini can read (not SoT) |
| **Gemini** | Translation / reasoning engine — Notebook + TranslationPack |
| **TranslationPack** | Current source + hot overrides only (slim when Notebook verified) |

Flow: `SQLite → NotebookKnowledgeBuilder → Drive (00–07) → Notebook → Gemini → Parser/QA → SQLite → NotebookSyncService`

Notebook never writes SQLite directly. Chat history is not truth.

## Knowledge files

| File | Contents |
|------|----------|
| `00_BOOK_PROFILE.md` | Metadata (rarely changes) |
| `01_TRANSLATION_RULES.md` | Rules + output protocol + priority |
| `02_PROJECT_TERMS.md` | Project terms only (not Global Vault) |
| `03_CHARACTERS.md` | Current character bible |
| `04_RELATIONSHIPS.md` | Address terms / relationships |
| `05_STORY_STATE.md` | Current story state (not official summary) |
| `06_WORLD_KNOWLEDGE.md` | Stable world facts |
| `07_RECENT_CONTEXT.md` | Rolling hot window (default 20 chapters) |

## Hot vs cold

- **Cold:** files 00–06 in Notebook after verified sync
- **Hot:** `notebook_hot_deltas` + slim pack overrides until Notebook verify clears them
- Priority: Pack instruction > Hot Memory > Locked terms > Project memory > Notebook > model prior

## Sync

- Dirty on term/character/story/metadata changes
- Drive sync every N chapters (default 10), critical events, or manual
- After Drive upload → `sync_pending` → verify sources → `ready` + clear hot deltas
- Drive upload ≠ Notebook already sees new sources

## Translate channel

- Prefer **Playwright Gemini-in-Notebook** when mapping `ready` / `sync_pending`
- Web API / no Notebook → **fat pack** from local ContextSelector (`ALLOW_HOT_CONTEXT_FALLBACK` default)
- Thread rotation every N batches (default 30)

## Bootstrap

Before first translate: `notebook:bootstrap` rebuilds 00–07 and seeds draft story/world from metadata + early chapters (not verified terms).

## Prepare at Start Translate

`notebook:prepareForTranslate` runs **before** `jobs.enqueue` when user clicks Start Translate / Retranslate:

1. Bootstrap if knowledge empty
2. Rebuild knowledge files
3. Drive sync when a worker/Drive assignment exists
4. Best-effort `notebook.provision` only if mapping missing/`error`/`pending` and worker READY
5. On assisted/fail → continue translate with fat-pack (`usedFallback: true`); do not hang UI

Learning after QA PASS marks dirty by kind: `TERM_CHANGED`, `CHARACTER_CHANGED`, `RELATIONSHIP_CHANGED`, `STORY_STATE_CHANGED`, `RECENT_CONTEXT_CHANGED`.

Clear / Retranslate chapter: delete unlocked AI translations (`human_locked` kept), then prepare + enqueue.

## UI

Project → **Bộ nhớ AI** (`/projects/:id/ai-memory`): health, 8 files, versions, Provision / Bootstrap / Rebuild / Sync / Check.
