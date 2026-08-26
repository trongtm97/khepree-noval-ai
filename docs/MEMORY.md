# Novel Memory Engine (Phase 8)

Structured novel memory for translation context: characters, relationships, story state, memory events, AI delta ingest with conflict queue.

## Data model

| Entity | Storage | Notes |
|--------|---------|-------|
| Characters | `characters` + `character_aliases` | CN/VN names, aliases, role, chapters, status, locked |
| Relationships | `character_relationships` | Timeline via `valid_from_chapter` / `valid_to_chapter`, calls, confidence |
| Story state | `story_states` | Separate columns — not one blob |
| Memory events | `memory_events` | Category + key/value, chapter-scoped |
| Conflicts | `memory_conflicts` | Pending AI contradictions |

Migration **006** adds locked flags, structured story fields, conflict table.

## AI delta pipeline

```
MEMORY_DELTA JSON
  → parseMemoryDelta()   # Zod
  → applyMemoryDelta()
      locked record? → conflict, skip write
      contradiction? → conflict, skip write
      else → upsert
```

Supported actions: `upsert`, `delete`, `relationship`, `story_state`.

Schema: `src/shared/schemas/memory-delta.ts`

## Context selection

`buildMemoryContext()` input:

- `projectId`
- `chapterIds` (batch)

Output (minimal, budget-trimmed):

- active terms (matched in batch text)
- active characters (name/alias hit in batch)
- relationships (both ends active)
- recent memory (last N chapters)
- critical project rules (`project_settings.style_config`, `custom` events `rule:*`)
- story state snapshot
- token budget estimate (offline heuristic — no online tokenizer)

Files:

- `src/main/memory/context-selector.ts`
- `src/main/memory/budget-estimator.ts`
- `src/main/memory/recent-memory.ts`
- `src/main/memory/relevant-memory.ts`

## IPC

| Channel | Purpose |
|---------|---------|
| `character:list` | List characters |
| `character:upsert` | Create/update character |
| `relationship:list` | List relationships (optional `atChapter`) |
| `relationship:upsert` | Create/update relationship |
| `memory:storyStateGet` | Get structured story state |
| `memory:storyStatePatch` | Patch story state |
| `memory:applyDelta` | Apply AI delta |
| `memory:conflictList` | Pending conflicts |
| `memory:conflictResolve` | Resolve/discard conflict |
| `memory:buildContext` | Build translation context |

UI: **Characters** page — tabs for characters, relationships, story state, conflict queue.

## Tests

`tests/unit/memory/memory-engine.test.ts`:

- relationship timeline filtering
- locked record protection
- conflicting delta → conflict queue
- relevant entity filtering
- offline token budget trim
