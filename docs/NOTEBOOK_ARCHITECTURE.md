# Notebook Architecture

## Roles

| Layer | Role |
|-------|------|
| **SQLite** | Source of truth — chapters, translations, terms, characters, relationships, story state, jobs, QA |
| **Local knowledge cache** | Markdown `00–08` rebuilt from SQLite after every learning PASS |
| **NotebookLM** | Optional AI knowledge layer — static file upload or copied text sources |
| **Gemini** | Translation / reasoning engine — Notebook + TranslationPack |
| **TranslationPack** | Current source + hot overrides (slim when Notebook grounding verified) |

Flow: `SQLite → NotebookKnowledgeBuilder → local cache → (optional) Notebook upload → Gemini → Parser/QA → SQLite → version bump`

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
| `08_SYNC_STATE.md` | Local version + nonce for Notebook probe |

## Hot vs cold

- **Cold:** files 00–07 in Notebook after verified grounding
- **Hot:** `notebook_hot_deltas` + slim pack overrides until Notebook verify clears them
- Priority: Pack instruction > Hot Memory > Locked terms > Project memory > Notebook > model prior

## Sync (local-first)

- **Learning PASS (default):** term/memory deltas → SQLite txn → `LOCAL_KNOWLEDGE_VERSION_BUMP` → rebuild local markdown — **no cloud upload**
- **Optional Notebook refresh:** `NotebookSyncService.syncLocalKnowledge` rebuilds cache + marks mapping `sync_pending`; operator re-uploads sources in Notebook UI
- **Version probe:** background prompt compares Notebook `08_SYNC_STATE` nonce vs local pending version
- Legacy DB rows may still contain deprecated `DRIVE_LIVE` binding types — read-only detection via `legacy-db-values.ts`

## Translate channel

- Prefer **Playwright Gemini-in-Notebook** when mapping `ready` / `sync_pending` and grounding verified
- Web API / no Notebook → **local_context pack** from SQLite (`ALLOW_HOT_CONTEXT_FALLBACK` default)
- Thread rotation every N batches (default 30)

## Bootstrap

Before first translate: `notebook:bootstrap` rebuilds 00–08 and seeds draft story/world from metadata + early chapters (not verified terms).

## Prepare at Start Translate

`notebook:prepareForTranslate` runs **before** `jobs.enqueue`:

1. Bootstrap if knowledge empty
2. Rebuild knowledge files from SQLite
3. Best-effort `notebook.provision` only if mapping missing/`error`/`pending` and worker READY
4. On assisted/fail → continue translate with local-context pack; do not hang UI

Learning after QA PASS bumps local version and rebuilds knowledge — effective for the **next** batch immediately.

Clear / Retranslate chapter: delete unlocked AI translations (`human_locked` kept), then prepare + enqueue.

## UI

Project → **Bộ nhớ AI** (`/projects/:id/ai-memory`): health, 8 files, versions, Provision / Bootstrap / Rebuild / Sync / Check.

See also [MEMORY.md](./MEMORY.md), [LEARNING.md](./LEARNING.md), [PORTABILITY.md](./PORTABILITY.md).
