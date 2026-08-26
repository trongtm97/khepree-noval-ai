# NovelTrans Studio — AI Output Protocol

> Contract between prompt builder, browser automation, output parser, and QA layer.

## 1. Purpose

Every translation request sent to Gemini/Notebook MUST instruct the model to return a **machine-parseable** response with three sections:

1. Translated paragraphs with stable IDs
2. Term discoveries/updates
3. Memory updates

Local QA validates structure before accepting. AI is only re-invoked for content repair, not for checks computers can do alone.

## 2. Response Format

```xml
<TRANSLATION>
[C000001:P000001] Vietnamese translation for paragraph 1...
[C000001:P000002] Vietnamese translation for paragraph 2...
</TRANSLATION>

<TERM_DELTA>
[
  {
    "action": "discover",
    "source": "灵气",
    "target": "linh khí",
    "reading": "líng qì",
    "category": "skill",
    "confidence": "high",
    "notes": "cultivation energy"
  },
  {
    "action": "update",
    "source": "李逍遥",
    "target": "Lý Tiêu Dao",
    "category": "name",
    "notes": "corrected spelling"
  }
]
</TERM_DELTA>

<MEMORY_DELTA>
[
  {
    "action": "upsert",
    "category": "plot",
    "key": "mc_power_level",
    "value": "Foundation Establishment Stage 3"
  },
  {
    "action": "upsert",
    "category": "character",
    "key": "char:li_xiaoyao:role",
    "value": { "role": "protagonist", "sect": "Qingyun" }
  },
  {
    "action": "relationship",
    "from": "李逍遥",
    "to": "赵灵儿",
    "type": "romantic_interest",
    "description": "Met in chapter 1"
  }
]
</MEMORY_DELTA>
```

### Section Rules

| Section | Required | Content |
|---------|----------|---------|
| `<TRANSLATION>` | Yes | One line per paragraph: `[ID] text` |
| `<TERM_DELTA>` | Yes | JSON array (may be `[]`) |
| `<MEMORY_DELTA>` | Yes | JSON array (may be `[]`) |

- Sections MUST appear in this order
- Tags are case-sensitive
- JSON MUST be valid UTF-8 arrays
- No markdown code fences inside tags

## 3. Translation Line Format

```
[C{chapter:06d}:P{paragraph:06d}] {target_text}
```

- ID MUST match a paragraph in the current batch
- One line per paragraph (multi-line translation: embed `\n` escaped or use continuation convention — TBD: prefer single line, use `\n` for explicit breaks)
- No empty translations
- No duplicate IDs within batch
- IDs are immutable after import — renaming a chapter title does **not** change IDs

### Regex

```typescript
const TRANSLATION_LINE = /^\[(C\d{6}:P\d{6})\]\s*(.+)$/;
```

## 4. TERM_DELTA Schema

```typescript
const TermDeltaItem = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('discover'),
    source: z.string().min(1),
    target: z.string().min(1),
    reading: z.string().optional(),
    category: z.enum(['name', 'place', 'item', 'skill', 'other']),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal('update'),
    source: z.string().min(1),
    target: z.string().min(1),
    category: z.enum(['name', 'place', 'item', 'skill', 'other']).optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal('confirm'),
    source: z.string().min(1),
    target: z.string().min(1),
  }),
]);

const TermDelta = z.array(TermDeltaItem);
```

### Promotion on Ingest

| action | promotion_status assigned |
|--------|---------------------------|
| discover | `DISCOVERED` or `CANDIDATE` (config) |
| update | unchanged status unless user rule |
| confirm | `PROJECT_VERIFIED` at most — never GLOBAL |

**Never** auto-set `GLOBAL_VERIFIED` or `LOCKED` from AI output.

## 5. MEMORY_DELTA Schema

```typescript
const MemoryDeltaItem = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert'),
    category: z.enum(['plot', 'world', 'glossary', 'character', 'custom']),
    key: z.string().min(1),
    value: z.union([z.string(), z.record(z.unknown())]),
  }),
  z.object({
    action: z.literal('delete'),
    category: z.string(),
    key: z.string(),
  }),
  z.object({
    action: z.literal('relationship'),
    from: z.string().min(1),       // source name — resolved to character
    to: z.string().min(1),
    type: z.string().min(1),
    description: z.string().optional(),
  }),
  z.object({
    action: z.literal('story_state'),
    patch: z.record(z.unknown()),  // merged into story_state.state_json
  }),
]);

const MemoryDelta = z.array(MemoryDeltaItem);
```

## 6. Prompt Template Structure

Prompt builder assembles:

```
## Instructions
- Translate Chinese to Vietnamese
- Output format: [exact protocol spec]
- Do not skip paragraph IDs
- Use locked terms exactly as provided

## Locked Terms (must match)
{locked_terms_json}

## Project Context
{style_config}
{recent_memory_summary}

## Character Reference
{character_table}

## Source Paragraphs
[C0001:P0001] 中文...
[C0001:P0002] 中文...
```

Prompt hash stored in `job_batches.prompt_hash` for audit.

## 7. Parser Pipeline

```
Raw text from browser
  → extractSections()        # find TRANSLATION, TERM_DELTA, MEMORY_DELTA tags
  → parseTranslation()       # line-by-line ID extraction
  → parseTermDelta()         # JSON parse + Zod
  → parseMemoryDelta()       # JSON parse + Zod
  → ParsedBatchResult
```

### ParsedBatchResult

```typescript
interface ParsedBatchResult {
  translations: Map<ParagraphId, string>;
  termDeltas: TermDeltaItem[];
  memoryDeltas: MemoryDeltaItem[];
  warnings: ParseWarning[];
  recoveryUsed: boolean;
}
```

## 8. Recovery Strategies

When model deviates from format:

| Issue | Recovery |
|-------|----------|
| Missing closing tag | Scan to EOF, log warning |
| JSON trailing comma | `json5` or strip + retry parse |
| Markdown fences around JSON | Strip ``` blocks |
| Missing TERM/MEMORY sections | Treat as empty arrays |
| Extra prose before/after tags | Ignore outside tags |
| Translation without tags | FAIL — trigger REPAIRING |
| Partial paragraph set | QA catches → repair missing IDs only |

After recovery, set `recoveryUsed: true` and add `ParseWarning` entries. If translation section unrecoverable → batch state `qa_fail`, job → `REPAIRING`.

## 9. Local QA Checks (No AI)

Run after parse, before persist:

| Check | Severity |
|-------|----------|
| Missing paragraph ID from batch | error |
| Duplicate paragraph ID in response | error |
| Empty translation text | error |
| Unknown paragraph ID | error |
| Locked term mismatch in translation | error |
| Invalid JSON structure (post-recovery) | error |
| Chapter completeness (all batch IDs present) | error |
| Extra IDs not in batch | warning |
| Term discover without target | error |

### QA Result

```typescript
interface QAResult {
  passed: boolean;
  errors: QAIssue[];
  warnings: QAIssue[];
  missingParagraphIds: ParagraphId[];
}
```

If `missingParagraphIds.length > 0` → job state `REPAIRING`, send **only** missing paragraphs in next prompt.

## 10. Repair Prompt

Minimal re-request:

```
Previous response missing translations for:
[C0001:P0005]
[C0001:P0006]

Output ONLY the <TRANSLATION> section for these IDs.
Use same format. No other text.
```

Repair batches do not re-apply term/memory deltas unless full batch re-run.

## 11. Versioning

Protocol version embedded in prompt:

```
Output Protocol Version: 1
```

Parser checks version header if present. Breaking changes increment version and add migration in parser.

## 12. Example Minimal Valid Response

```xml
<TRANSLATION>
[C0001:P0001] Hắn bước vào rừng sâu.
</TRANSLATION>

<TERM_DELTA>
[]
</TERM_DELTA>

<MEMORY_DELTA>
[]
</MEMORY_DELTA>
```

## 13. Files

| Module | Path |
|--------|------|
| Schemas | `src/shared/schemas/output-protocol.ts` |
| Parser | `src/main/jobs/output-parser.ts` |
| Recovery | `src/main/jobs/output-recovery.ts` |
| QA | `src/main/jobs/qa-checker.ts` |
| Prompt builder | `src/main/jobs/prompt-builder.ts` |
