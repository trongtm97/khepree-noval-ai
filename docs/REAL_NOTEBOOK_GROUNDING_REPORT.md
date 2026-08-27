# Real Notebook Grounding Report

> Proves **real** NotebookLM grounding (no mocks). Opt-in only via Developer Diagnostics or env.
> This report is overwritten by the smoke runner. Never exposes cookies/tokens.

| Field | Value |
| --- | --- |
| Overall | **NOT_RUN** |
| Started | — |
| Finished | — |
| Notebook URL | — |
| Notebook name | — |
| Knowledge key | — |
| Profile | — |
| Artifacts | — |

## Tests

| ID | Name | Result | Local ver | Notebook ver | Binding | Drive file id | Pack | Response | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| A | STATIC grounding (key → value) | **SKIP** | — | — | — | — | — | — | NOT_RUN — opt-in via Diagnostics or NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1 |
| B | LIVE Drive update (no remove/re-add) | **SKIP** | — | — | — | — | — | — | NOT_RUN — opt-in via Diagnostics or NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1 |
| C | SLIM translation (glossary in Notebook only) | **SKIP** | — | — | — | — | — | — | NOT_RUN — opt-in via Diagnostics or NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1 |
| D | Learning loop (SQLite → Drive → Notebook) | **SKIP** | — | — | — | — | — | — | NOT_RUN — opt-in via Diagnostics or NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1 |

## Legend

| ID | Intent |
| --- | --- |
| A | Static key/value in Notebook source; ask by key only |
| B | Drive content update + version bump; no remove/re-add; stale → `NOTEBOOK_SOURCE_STALE` |
| C | SLIM pack: Chinese source only; VI glossary must come from Notebook |
| D | Confirmed learning: SQLite dirty → Drive → Notebook verify → new mapping |

## How to run

```bash
copy google-smoke.config.example.json google-smoke.config.json
# edit profilePath + smoke notebookUrl; optionally grounding*DriveFileId
set NOVELTRANS_NOTEBOOK_GROUNDING_SMOKE=1
npm run test:notebook-grounding-smoke
```

Or: Developer Diagnostics → **Run Notebook Grounding Smoke**.

**Never** run against a production novel project.
