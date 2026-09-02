# Multi-Provider Release Acceptance Matrix (Phase 7)

**Date:** 2026-08-29  
**Scope:** Prove Gemini, ChatGPT, and Meta AI share the **same** Khepree Novel AI translation pipeline — not adapter-only unit tests.

**Final status:** **READY FOR EXTENDED TEST** (mock integration PASS; live browser smoke NOT_RUN in CI)

> Do **not** treat this as production-ready until real browser smoke passes for each provider.

---

## Executive summary

| Layer | Verdict |
|-------|---------|
| Mock full pipeline (Project → Scheduler → AiProviderManager) | **PASS** |
| Zero-Google ChatGPT / Meta | **PASS** |
| Multi-account + cross-provider concurrency | **PASS** |
| Translation protocol + multilingual pairs | **PASS** |
| Adaptive chunking (long chapter) | **PASS** |
| Repair + fallback | **PASS** |
| Send reliability (harness) | **PASS** (unit) |
| Crash duplicate safety (Gemini planner) | **PASS** (planner) |
| Diagnostics redaction | **PASS** (unit) |
| Live browser smoke (ChatGPT / Meta / Gemini) | **NOT_RUN** |

---

## Acceptance matrix

| Provider | Login | Send Confirm | Response Anchor | Translation | Repair | Fallback | Restart | Concurrency | Result |
|----------|-------|--------------|-----------------|-------------|--------|----------|---------|-------------|--------|
| **Gemini** (Playwright) | PASS mock | PASS harness† | PASS harness† | PASS mock | PASS mock | PASS mock‡ | PASS planner§ | PASS mock | **MOCK PASS** |
| **ChatGPT** | PASS mock | PASS harness† | PASS harness† | PASS mock | PASS mock | PASS mock | PARTIAL¶ | PASS mock | **MOCK PASS** |
| **Meta AI** | PASS mock | PASS harness† | PASS harness† | PASS mock | PASS mock | PASS mock | PARTIAL¶ | PASS mock | **MOCK PASS** |
| **Gemini** live browser | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | **NOT_RUN** |
| **ChatGPT** live browser | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | **NOT_RUN** |
| **Meta AI** live browser | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | **NOT_RUN** |

† `tests/unit/automation/browser-conversation-harness.test.ts` + fixture DOM  
‡ `tests/integration/multi-provider-acceptance.test.ts` — ChatGPT TIMEOUT → Meta SUCCESS  
§ `planGeminiRequestRecovery` — no resend after SEND_CONFIRMED / UNKNOWN_AFTER_CRASH  
¶ `ai_requests` table exists; browser AI crash recovery planner not yet wired (Gemini-only recovery today)

---

## I. Mock integration

**Test:** `tests/integration/multi-provider-acceptance.test.ts` — section I

Wires real:

- `Project` + `Edition` (`ensureDefaultEdition`)
- `JobService.enqueueTranslate`
- `AutomationScheduler`
- `AiProviderManager.sendForJob`

Captures:

- `executionTarget` (providerId, accountKind, accountId)
- Final `TranslationPack` (prompt, promptHash, language pair)

**Helper:** `tests/helpers/multi-provider-pipeline.ts`

---

## II. Provider cases

| Case | Test | Result |
|------|------|--------|
| Gemini only | II — Playwright Gemini + Google account | PASS |
| ChatGPT only | II | PASS |
| Meta only | II | PASS |
| Gemini + ChatGPT + Meta (3 projects) | II | PASS |
| Gemini + ChatGPT (2 accounts parallel) | `execution-worker-matrix.test.ts` | PASS |
| ChatGPT + Meta parallel | `execution-worker-matrix.test.ts` | PASS |
| All three concurrent | IV–V | PASS |

---

## III. Zero Google (CRITICAL)

| Scenario | Test | Result |
|----------|------|--------|
| No Google, ChatGPT READY, synthetic chapter | III | **PASS** |
| No Google, Meta READY, synthetic chapter | III | **PASS** |

Also: `tests/unit/jobs/execution-worker-matrix.test.ts`, `startup-ai-readiness.test.ts`

---

## IV. Multi-account

| Scenario | Result |
|----------|--------|
| ChatGPT A + B, two projects, parallel | PASS |
| Same account — profile lease serializes browser ops | PASS (`profileLockManager.listActiveLeases()` empty after job) |

---

## V. Cross-provider concurrency

| Scenario | Result |
|----------|--------|
| Project A → Gemini, B → ChatGPT, C → Meta simultaneously | PASS |
| Distinct concurrency keys, no lock leak | PASS |

---

## VI. Send reliability

| Check | Location | Result |
|-------|----------|--------|
| Send confirmed → generation → anchor → stable → capture | Harness mock + fixtures | PASS |
| Send failure — stale response rejected | `browser-conversation-harness.test.ts` CRITICAL test | PASS |
| Injected send_noop → SEND_NOT_CONFIRMED | Harness | PASS |
| ChatGPT / Meta fixture DOM | `chatgpt-send-ok.html`, `meta-send-ok.html` | PASS |

---

## VII. Translation protocol

Synthetic 3 paragraphs, stable IDs `[C000001:P000001…3]`, locked term `XLOCKTERM` → `PreferredLockForm`.

| Assert | Result |
|--------|--------|
| All IDs present | PASS |
| No duplicates | PASS |
| Target language in pack | PASS |
| Locked term in QA | PASS |
| Parser status ok | PASS |

---

## VIII. Multilingual

For each provider path, language policy comes from **project/edition**, not provider:

| Pair | Result |
|------|--------|
| zh-Hans → vi | PASS |
| ja → en | PASS |
| en → es | PASS |
| ar → vi | PASS |

Also: `multilingual-production-acceptance.test.ts`, `multilingual-concurrency-matrix.test.ts`

---

## IX. Long chapter

| Check | Result |
|-------|--------|
| 5 × 12k-char paragraphs → multiple ChatGPT sends | PASS |
| Continuation merges chunks | PASS (manager `finalizeChunkWithContinuation`) |

---

## X. Repair

| Check | Result |
|-------|--------|
| Force missing paragraph → repair round | PASS |
| Repair pack preserves ja→en pair | PASS |
| Same provider/account where feasible | PASS (Meta pinned) |

---

## XI. Fallback

| Scenario | Result |
|----------|--------|
| ChatGPT TIMEOUT → Meta SUCCESS | PASS (mock) |
| Gemini rate limit → ChatGPT | PASS (`multilingual-production-acceptance.test.ts` sendWithFallback) |
| Meta login expired → other provider | PARTIAL (resolver returns 0 targets when PIN; AUTO fallback in manager) |
| Attempt chain recorded | PASS (job attempts + progress timeline when backend emits) |

---

## XII. Duplicate safety

| Scenario | Result |
|----------|--------|
| Crash after SEND_CONFIRMED — no blind resend | PASS (`planGeminiRequestRecovery`) |
| UNKNOWN_AFTER_CRASH + marker found → capture/wait | PASS |
| ChatGPT/Meta `ai_requests` recovery | **GAP** — schema ready, planner not wired |

---

## XIII. Diagnostics

Failure reports must include provider, account, surface, request state, selectors, send/response proof, screenshot, sanitized output.

| Check | Location | Result |
|-------|----------|--------|
| No password/cookie/session in export | `diagnostics.test.ts`, `redactDiagnosticText` | PASS |
| Harness `getDiagnostics()` on adapters | Harness tests | PASS |
| ChatGPT/Meta-specific failure ZIP | PARTIAL — generic automation diagnostics |

---

## XIV. Real browser smoke (manual / dev-gated)

**Script:** `scripts/browser-conversation-smoke.ts`  
**Report script:** `scripts/browser-conversation-smoke-report.ts`

```bash
# Requires logged-in profile + env flag
set BROWSER_CONVERSATION_SMOKE=1
npx tsx scripts/browser-conversation-smoke.ts chatgpt
npx tsx scripts/browser-conversation-smoke.ts meta
# Gemini: NOT_RUN — use tests/google-smoke with KHEPREE_NOVEL_AI_GOOGLE_SMOKE=1
npx tsx scripts/browser-conversation-smoke-report.ts
```

| Provider | Login | Send | Translation | Result |
|----------|-------|------|-------------|--------|
| ChatGPT | NOT_RUN | NOT_RUN | NOT_RUN | **NOT_RUN** |
| Meta AI | NOT_RUN | NOT_RUN | NOT_RUN | **NOT_RUN** |
| Gemini | NOT_RUN | NOT_RUN | NOT_RUN | **NOT_RUN** |

**Rule:** NOT_RUN is never reported as PASS.

---

## XV. Test commands

```bash
npm install   # if node_modules broken
npm run test:integration -- tests/integration/multi-provider-acceptance.test.ts
rtk vitest run tests/unit/jobs/execution-worker-matrix.test.ts
rtk vitest run tests/unit/automation/browser-conversation-harness.test.ts
rtk vitest run tests/integration/multilingual-production-acceptance.test.ts
```

---

## Gaps before RELEASE CANDIDATE

1. Run live browser smoke for ChatGPT, Meta, Gemini — record PASS/FAIL explicitly.
2. Wire `ai_requests` recovery planner for ChatGPT/Meta (mirror Gemini `UNKNOWN_AFTER_CRASH`).
3. Emit `provider_fallback` timeline events during manager fallback (UI chain display).
4. End-to-end fallback under scheduler with failing primary mock (not only manager-level).

---

## Related docs

- `docs/MULTI_PROVIDER_UX_AUDIT.md` — Phase 6 operational UI
- `docs/AI_EXECUTION_WORKER_AUDIT.md` — execution target model
- `docs/BROWSER_CONVERSATION_RELIABILITY.md` — harness lifecycle
- `docs/MULTILINGUAL_PROMPT_ACCEPTANCE.md` — language pair policy
