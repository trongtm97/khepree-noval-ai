# Real Google Smoke Test Report

> **Gate:** Playwright Gemini / NotebookLM path is **not production-ready** until Overall = **PASS**.
> This report is overwritten by `npm run test:google-smoke`. Do not claim readiness from unit tests alone.

| Field | Value |
| --- | --- |
| Overall | **NOT_RUN** |
| Started | — |
| Finished | — |
| Notebook | — |
| Profile | — |
| Artifacts | — |

## Scenarios

| ID | Name | Result | Duration (ms) | Notes | Screenshot (fail) |
| --- | --- | --- | ---: | --- | --- |
| A | Open Translation Notebook | **NOT_RUN** | — | Run `npm run test:google-smoke` | — |
| B | Exact smoke token response | **NOT_RUN** | — | | — |
| C | Multiline medium prompt | **NOT_RUN** | — | | — |
| D | Translate 3 fake paragraphs (IDs) | **NOT_RUN** | — | | — |
| E | Refresh page then continue | **NOT_RUN** | — | | — |
| F | Close / reopen persistent profile | **NOT_RUN** | — | | — |
| G | New thread | **NOT_RUN** | — | | — |
| H | FULL preprocess tiny fixture | **NOT_RUN** | — | | — |

## Scenario legend

| ID | Intent |
| --- | --- |
| A | Open correct Translation Notebook |
| B | Exact token `NOVELTRANS_SMOKE_OK` |
| C | Multiline medium prompt |
| D | Translate 3 fake paragraphs; assert all IDs |
| E | Refresh page mid-session then continue |
| F | Close browser / reopen persistent profile |
| G | New thread |
| H | FULL preprocess tiny fixture (smoke notebook only) |

## How to run

```bash
copy google-smoke.config.example.json google-smoke.config.json
# edit profilePath + smoke notebookUrl (dedicated SMOKE notebook — never production)
set NOVELTRANS_GOOGLE_SMOKE=1
npm run test:google-smoke
```

Or: Developer Diagnostics → **Run Real Google Smoke**.

**Never** run against a production novel project.
