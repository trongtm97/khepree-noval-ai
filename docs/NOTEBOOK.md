# NotebookLM Provider

See also: [NOTEBOOK_ARCHITECTURE.md](./NOTEBOOK_ARCHITECTURE.md) for roles, knowledge files, hot/cold memory, and sync lifecycle.

Playwright-driven NotebookLM / Gemini Notebook automation. Selectors live in one registry — never scattered.

## Mapping

**1 project → 1 notebook per Google Worker**

| Field | Value |
|-------|--------|
| Name | `[Khepree Novel AI] <Novel Name>` |
| Sources | Local-built markdown `00_BOOK_PROFILE.md` … `07_RECENT_CONTEXT.md` (from SQLite via `NotebookKnowledgeBuilder`) |
| Instructions | Long-term knowledge role + `style_config` overrides |

Persisted in `notebook_resources` (+ migration 017: knowledge versions, sync timestamps, thread batch counter).

## Source content on first setup

`notebook:bootstrap` builds knowledge from metadata + optional early-chapter seed into SQLite, then rebuilds markdown. Re-upload / Drive sync later to refresh Notebook.

## Provider methods

`NotebookProvider` — UI automation only (create/open/add sources/instructions/verify). Does **not** build knowledge markdown.

## Idempotent flow

1. Detect UI
2. Find/create notebook by name
3. Build knowledge via `NotebookKnowledgeBuilder`
4. Add sources (file → text → Drive)
5. Set instructions
6. Verify → mark knowledge verified / clear hot deltas

## IPC

| Channel | Action |
|---------|--------|
| `notebook:list` / `get` | Mappings |
| `notebook:provision` / `resume` | Setup |
| `notebook:health` | Versions + file dirty flags |
| `notebook:rebuild` | Rebuild local knowledge |
| `notebook:syncNow` | Drive upload → sync_pending |
| `notebook:bootstrap` | Pre-translate seed + rebuild |

## UI

Projects → **Bộ nhớ AI**, and Translation → AI panel link.
