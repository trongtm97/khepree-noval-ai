# Translation Pack Builder

Minimal prompt assembly for translation batches — **provider-neutral**, built from project `source_language` / `target_language` and edition context.

## Goal

Smallest prompt that still has enough active context. Never dump:

- entire Term Vault
- entire character database
- all previous chapters

## Input

| Field | Constraint |
|-------|------------|
| `projectId` | required |
| `chapterIds` | 1–5 chapters |
| `style` | `literal` \| `balanced` \| `natural` \| `xianxia` \| `urban` \| `romance` |
| `extraRules` | optional project overrides |

## Output — `TranslationPack`

Rendered sections (in order):

1. **Task header** — style + chapter range
2. **Critical rules** — style preset + project rules
3. **Hot memory delta** — active characters, relationships, recent memory, story snapshot
4. **Active project terms** — matched in batch only
5. **Source paragraphs** — `[C0451:P0001] …`
6. **Output protocol** — exact XML sections required from AI

Also returns size metrics:

- `sourceChars`
- `contextChars`
- `totalChars`
- `estimatedTokens` (offline heuristic)

## AI output contract

```xml
<TRANSLATION>
[C000451:P000001] ...
</TRANSLATION>

<TERM_DELTA>
[]
</TERM_DELTA>

<MEMORY_DELTA>
[]
</MEMORY_DELTA>
```

Schemas:

- Zod: `src/shared/schemas/term-delta.ts`, `src/shared/schemas/memory-delta.ts`
- JSON Schema descriptors: `TERM_DELTA_JSON_SCHEMA`, `MEMORY_DELTA_JSON_SCHEMA`

`MEMORY_DELTA` is a **JSON array** (same as Phase 8 processor), not a single blob object.

## IPC

| Channel | Purpose |
|---------|---------|
| `pack:listChapters` | Chapter picker data |
| `pack:build` | Build pack + prompt preview |

## UI

**Translation** page:

- Select project + 1–5 chapters
- Choose style
- Prompt Preview: source/context/total chars + estimated tokens + full prompt text

## Bloat guards

`PACK_SIZE_LIMITS` + Vitest snapshots in `tests/unit/prompt/translation-pack.test.ts`:

- context section ceilings
- stable section snapshots
- no prior-chapter IDs in source block

## Files

- `src/main/prompt/translation-pack-builder.ts`
- `src/main/services/translation-pack-service.ts`
- `src/shared/constants/translation-pack.ts`
- `src/shared/schemas/translation-pack.ts`
- `src/shared/schemas/term-delta.ts`
