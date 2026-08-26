# Response Parser & Local QA (Phase 13)

Parse Gemini raw text → structured batch → local QA → optional RepairPack.

## Pipeline

```
raw model text
  → ResponseParser.parse()
      1. strict parse (exact tags + JSON.parse + Zod)
      2. tolerant extractSections (fences, intro, missing closes)
      3. safe JSON repair (trailing comma, quotes, truncated ])
      4. if uncertain → status: needs_repair  (never invent translations)
  → runLocalQa(sourceIds, lockedTerms)
  → buildRepairPack(missingIds only + local context)
```

## Modules

| File | Role |
|------|------|
| `src/main/jobs/response-parser.ts` | `ResponseParser` |
| `src/main/jobs/output-recovery.ts` | Section extraction |
| `src/main/jobs/json-repair.ts` | Conservative JSON fixes |
| `src/main/jobs/qa-checker.ts` | SOURCE_IDS vs TRANSLATED_IDS + locked terms |
| `src/main/jobs/repair-pack-builder.ts` | Missing paragraphs only |

## Parse statuses

| Status | Meaning |
|--------|---------|
| `ok` | Strict success |
| `recovered` | Tolerant/repair used; content usable |
| `needs_repair` | Uncertain — do not accept as complete |

## QA verdicts

| Verdict | When |
|---------|------|
| `PASS` | All IDs present, ordered, no locked issues |
| `PASS_WITH_WARNINGS` | e.g. out-of-order only |
| `REPAIR_REQUIRED` | Missing / empty paragraphs (or parse needs_repair with clear gaps) |
| `MANUAL_REVIEW` | Duplicates, unknown IDs, locked-term flags, ambiguous parse |

## Locked terms

If source paragraph contains locked Chinese term:

- Preferred Vietnamese **must** appear → else `locked_term_missing`
- Listed `forbiddenVariants` must **not** appear → else `locked_term_forbidden_variant`
- **Never** auto-replace text when ambiguous

## RepairPack

Only missing IDs + neighbor context (`contextRadius`, default 1). Prompt asks for `<TRANSLATION>` only.

## Tests

- `tests/unit/jobs/response-parser.test.ts` — many malformed fixtures
- `tests/unit/jobs/qa-checker.test.ts` — ID matrix + locked + repair pack

## Not in this phase

Job state machine / batch executor / DB ingest of deltas (later).
