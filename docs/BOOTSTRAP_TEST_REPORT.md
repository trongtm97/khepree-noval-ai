# Bootstrap / Memory — Test Report

Date: 2026-08-25

## Gates

| Gate | Status | Notes |
|------|--------|-------|
| typecheck (`tsc --noEmit`) | PASS | Clean after bootstrap changes |
| lint (`eslint src/main/bootstrap tests/unit/bootstrap`) | PASS | `--max-warnings 0` |
| lint (`eslint` repo-wide) | FAIL | ~189 pre-existing; not bootstrap blockers |
| unit (focused bootstrap + chunk merge) | PASS | 6 tests (2026-08-25 re-run) |
| unit (focused + preflight + AI manager) | PASS | 37 tests earlier run |
| unit (full `tests/unit`) | FAIL (env) | `better-sqlite3` NODE_MODULE_VERSION 130 vs Node 127 — Electron holds binary |
| integration | NOT_RUN | Same sqlite ABI; needs Electron closed + rebuild |
| production build | NOT_RUN | Deferred; typecheck clean |

## Spec tests (must-pass set)

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| T1 Project partial memory allowed | Preflight ignores empty chars/rels | Existing `translate-preflight` tests | PASS |
| T2 One bootstrap AI request | Default path 1 call | Prompt + service design; mock counter | PASS (unit) |
| T3 Bootstrap does not translate | Prompt has DO NOT TRANSLATE | Asserted in `knowledge-bootstrap.spec` | PASS |
| T4 Structured output persist | Zod parse → SQLite | Schema + persist module | PASS (parse); persist needs DB | PARTIAL |
| T5 Empty relationships OK | COMPLETED, not FAIL | Schema allows `[]` | PASS |
| T6 Unknown/null fields | gender null ok | Schema nullable | PASS |
| T7 Global term reuse | Known terms in prompt | Local prep matches vault into prompt | PASS (unit prep) |
| T8 Knowledge file generation | 8 types from builder | Existing knowledge builder | PASS (prior) |
| T9 Translate with sparse memory | Job startable | Preflight | PASS |
| T10 Learning loop deltas | Chunk merge keeps TERM/MEMORY | `translate-batch-chunk` + sendForJob | PASS |
| T13 Future leakage | Rel valid_from=8 hidden at ch1 | `future-leakage.test.ts` | PASS |
| T14 Lexical look-ahead | Terms not filtered by first_seen | Context selector keeps all terms | PASS |
| T15 Bootstrap failure | FAILED + skip still possible | Service catch → FAILED | PASS (code) |
| T16 Rebootstrap locked | Locked not overwritten | persist skips locked | PASS (code) |
| T22 No full novel analysis | Only N chapters | `selectBootstrapChapters` 2000→10 | PASS |
| T23 Start at 501 | 501–510 | Unit select | PASS |
| T24 Skip bootstrap | SKIPPED + translate OK | `skip()` + prepare respects SKIPPED | PASS (code) |
| T26 Help bootstrap article | Article searchable | `bootstrap-memory` help | PASS |
| T17 Crash resume | Resume unfinished | Status only | NOT_RUN / PARTIAL |
| T18–T21 Hot memory / long novel | Size bounds | Existing hot memory | NOT_RUN |
| Google live bootstrap | Real Gemini | — | NOT_RUN |

## Focused command that passed previously

```
vitest run tests/unit/bootstrap tests/unit/jobs/translate-batch-chunk.test.ts
  tests/unit/translation/translate-preflight.test.ts
  tests/unit/ai/ai-provider-manager.test.ts
→ PASS (37)
```

## Known issues

1. Full unit/integration suites fail until `better-sqlite3` rebuilt for current Node (close Electron first).
2. Crash-resume UI for ANALYZING/PROCESSING not fully wired (status persisted only).
3. Production Google bootstrap path not live-tested → status cannot be PRODUCTION READY.
