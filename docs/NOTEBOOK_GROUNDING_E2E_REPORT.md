# Notebook Grounding E2E — Regression Report

**Date:** 2026-08-27  
**Scope:** Prove FULL-novel path uses Translation Notebook knowledge (CONTENT_CURRENT), not prompt leakage.  
**Harness:** Offline integration (`tests/integration/notebook-grounding-e2e.test.ts`)  
**Command:** `pnpm exec vitest run tests/integration/notebook-grounding-e2e.test.ts`

---

## Verdict

# **PASS (architecture harness)**

| Gate | Result |
| --- | --- |
| FULL corpus pack + Research preprocess import | **PASS** |
| SQLite contains probe character + term | **PASS** |
| Translation knowledge 00–07 (+ sync_state) built | **PASS** |
| Drive LIVE sync + version/nonce probe | **PASS** |
| SLIM pack does **not** contain probe mapping | **PASS** |
| Translation output uses Notebook expected VI | **PASS** |
| Update → new VI after version bump | **PASS** |
| Live Gemini / Real Google | **NOT IN THIS HARNESS** (see Limits) |

---

## Why this test exists

Notebook READY must **not** mean:

- URL opens
- Source names present
- Source count matches

READY + SLIM requires Notebook reading **current knowledge version**.  
If the test term mapping appears **inside the SLIM pack**, the run is **INVALID** — Gemini could “cheat” from the prompt, so Notebook contribution is unproven.

---

## Probe facts (not in generic prompts)

| Source | Expected VI (initial) | Updated VI |
| --- | --- | --- |
| 紫洛安 (character) | Tử Lạc An | — |
| 玄星玉 (item) | Huyền Tinh Ngọc | Huyền Tinh Thạch |

Fixture:

- `tests/fixtures/full-novel-grounding/novel-ch01.txt`
- `tests/fixtures/full-novel-grounding/research-response.md` (fenced 00–07 Research raw)

---

## Flow under test (FULL — not skipped)

```
FULL CORPUS
  → packCorpus + FULL preprocess prompt
  → Research analysis raw (fixture)
  → parser / importResult
  → SQLite (candidates + character)
  → confirm → project terms
  → structured 00–07 (+ 08_SYNC_STATE)
  → Drive LIVE sync (noop upload in harness)
  → version probe (NT_VERSION + NT_NONCE)
  → SLIM Translation Pack
  → Notebook-grounded translate
```

### Assert contract

1. Research import found ≥6 knowledge files.  
2. SQLite has 玄星玉 (+ 紫洛安 character).  
3. `version_probe_status === verified` and `usableForSlimPack`.  
4. `resolveTranslationPackMode` → **slim** / `ready_verified`.  
5. SLIM prompt contains source 玄星玉 but **not** `玄星玉 → Huyền Tinh Ngọc` in overrides.  
6. Translator that reads **only** Notebook knowledge docs returns **Huyền Tinh Ngọc**.  
7. After rename + Drive + re-probe: output uses **Huyền Tinh Thạch**.

Helper: `tests/integration/helpers/notebook-grounded-translate.ts`  
Throws `NotebookGroundingTestInvalidError` if pack already contains the mapping.

---

## Product fix required for a valid SLIM proof

**Before:** SLIM/HYBRID shared soft-match dump (up to 15 unlocked terms). Matched batch terms (e.g. 玄星玉) leaked into the pack → grounding proof invalid.

**After:** SLIM Active Overrides = **LOCKED only**. Soft matches stay in HYBRID/FAT.

File: `src/main/prompt/translation-pack-builder.ts` → `buildActiveTerms`.

---

## What is faked vs real

| Step | Harness |
| --- | --- |
| Corpus pack / prompt / import / parser / SQLite / knowledge build | **Real** NovelTrans code |
| Research Notebook chat (Gemini analysis) | **Fixture** raw response (FULL schema) |
| Drive upload | **Noop** sync callback |
| Version probe capture | **Injected** expected version+nonce |
| Translation Notebook Gemini reply | **Simulated** from knowledge docs only |

This proves the **control plane**: CONTENT_CURRENT + SLIM excludes cold mappings + knowledge docs hold the mapping the translator must use.

It does **not** replace Real Google smoke for live NotebookLM indexing / model behavior.

---

## How to re-run

```bash
# Integration grounding regression (default npm test includes tests/integration)
pnpm exec vitest run tests/integration/notebook-grounding-e2e.test.ts

# Related unit guards
pnpm exec vitest run tests/unit/notebook/knowledge-version-probe.test.ts tests/unit/prompt/pack-mode-transitions.test.ts
```

Optional live proof (separate): `npm run test:google-smoke` with logged-in profile — not required for this report’s PASS.

---

## Files touched

| Path | Role |
| --- | --- |
| `tests/fixtures/full-novel-grounding/*` | Novel + Research raw |
| `tests/integration/notebook-grounding-e2e.test.ts` | E2E regression |
| `tests/integration/helpers/notebook-grounded-translate.ts` | Invalid-pack guard + Notebook-only translate |
| `src/main/prompt/translation-pack-builder.ts` | SLIM locked-only |
| `docs/NOTEBOOK_GROUNDING_E2E_REPORT.md` | This report |

---

## Evidence (this run)

```
✓ FULL flow: Research → SQLite → version verify → SLIM without mapping → Notebook term
✓ UPDATE: term rename bumps version; new Notebook mapping used; pack still clean
Test Files  1 passed
Tests       2 passed
```

Also green: `pack-mode-transitions` (10), `knowledge-architecture` (10).
