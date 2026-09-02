# Tabular Data Import / Export

Khepree Novel AI tabular subsystem for **CSV** and **XLSX** import/export. SQLite remains the source of truth. This does **not** replace full backup ZIP (`.nts-project.zip`).

## Architecture

| Component | Role |
|-----------|------|
| `TabularSchemaRegistry` | Maps `terms` / `characters` / `translations` data types to column schemas and handlers |
| `TabularExportService` | Writes Khepree Novel AI-owned exports with `_META` (XLSX) or sidecar `.meta.json` (CSV) |
| `TabularImportService` | File dialogs + orchestration |
| `ImportPreviewService` | Parse → validate → preview session (max 500 rows in UI payload) |
| `ImportCommitService` | Transactional commit + `import_history` audit + undo |

Pipeline:

```
SELECT FILE → DETECT FORMAT → PARSE → DETECT TYPE → VALIDATE → PREVIEW
→ USER CONFIRM → TRANSACTION → IMPORT REPORT
```

Parsing runs in the **main process** (not renderer).

## Formats

### XLSX

- Sheet `_META`: `khepree_novel_ai_format=NTS_TABULAR`, `schema_version=2`, `exported_at`, `data_type`, `project_id`, `edition_id`, `source_language`, `target_language`
- Data sheet: `terms`, `characters`, or `TRANSLATIONS`
- No formula evaluation; no macros (`.xlsm` not supported)

### CSV

- UTF-8 / UTF-8 BOM (import via existing `detectAndDecode`)
- Delimiter auto-detect: comma, semicolon, tab
- Export: UTF-8 BOM **on** by default (Excel Windows)
- Khepree Novel AI export writes `filename.csv.meta.json` sidecar; header `# key: value` comments also supported

External CSV without metadata is allowed when headers match a known schema.

## Import modes

- `IMPORT_VALID_ONLY` — skip error rows (default)
- `REQUIRE_ALL_VALID` — block commit if any error row exists

## Idempotency

- Rows with stable `id` from Khepree Novel AI export → update existing record
- External rows without `id` → natural key (`source_text` + language pair + scope for terms; `canonical_source_name` per project for characters)

## Audit & undo

Table `import_history` stores per-batch stats and undo snapshots. **Undo last import** reverses inserts and restores prior field values for updates.

## IPC

- `tabular:selectImportFile`
- `tabular:preview`
- `tabular:commit`
- `tabular:discardPreview`
- `tabular:selectExportPath`
- `tabular:export`
- `tabular:undoLast`
- `tabular:listHistory`

## Character workbook (schema v2)

Data type `characters` — multi-sheet XLSX workbook (CSV exports `CHARACTERS` sheet only).

| Sheet | Purpose |
|-------|---------|
| `CHARACTERS` | Source-scoped: `character_id`, `canonical_source_name`, `role`, `gender`, `first_seen_chapter`, `description`, `source_aliases`, `locked_facts` |
| `CHARACTER_TRANSLATIONS` | Edition-scoped names: `preferred_name`, `target_aliases`, `locked`, `notes` |
| `RELATIONSHIPS` | Graph edges between characters |
| `RELATIONSHIP_RENDERING` | Edition-scoped address terms (`a_calls_b`, `b_calls_a`) |

Import rules:

- Stable `character_id` / `relationship_id` preferred
- Without ID: match by **exact** `canonical_source_name` only (no alias guessing)
- `AMBIGUOUS_CHARACTER` → preview error, no guess
- `DISPLAY_NAME_COLLISION` → warning only; **never** merge two characters because display names match
- Commit order: CHARACTERS → CHARACTER_TRANSLATIONS → RELATIONSHIPS → RELATIONSHIP_RENDERING

Legacy v1 flat CSV (`canonical_name` + `preferred_name` in one sheet) still supported.

## Project Data Workbook (schema v2)

Data type `project_data` — multi-sheet XLSX for project metadata and knowledge.

| Sheet | Import policy |
|-------|----------------|
| `PROJECT` | Safe metadata only (`source_title`, `edition_title`, `author`, `genre`, `description`, `official_summary`) |
| `RULES` | Full import into `style_config.workbookRules` |
| `WORLD_KNOWLEDGE` | Preview + import → `story_states.world_knowledge_json` |
| `STORY_FACTS` | **Advanced** — preview warning `STORY_FACTS_ADVANCED`; writes `memory_events` |

Post-import: `NotebookSyncService.markDirty()` for affected knowledge types (no direct Drive sync).

UI: `TabularImportExportDialog` on Project Info page.

## Source Workbook (schema v2)

Data type `source_workbook` — optional chapter/source spreadsheet workflow. **Source Folder remains recommended** for normal novel ingestion.

| Sheet | Columns | Notes |
|-------|---------|-------|
| `CHAPTERS` | `chapter_id`, `chapter_number`, `chapter_type`, `title`, `sequence_order`, `source_status`, `translated_status` | Metadata correction; `translated_status` is export-derived |
| `PARAGRAPHS` | `chapter_id`, `paragraph_id`, `sequence`, `source_text` | One row per paragraph (never whole chapter in one cell) |

CSV export/import uses **paragraph-level** rows (`PARAGRAPHS` columns). Stable `paragraph_id` required for updates.

Import modes:

| Mode | Behavior |
|------|----------|
| `METADATA_ONLY` | CHAPTERS metadata only; paragraph `source_text` never overwritten |
| `UPDATE_SOURCE_CONTENT` | Paragraph source writes allowed; required when project has linked source files |

Safety:

- Linked source folder/files → `SOURCE_OVERWRITE_BLOCKED` unless `UPDATE_SOURCE_CONTENT`
- Source text change on translated chapter → `NEEDS_RETRANSLATION` warning; commit sets `needs_retranslation` + `SOURCE_MODIFIED`

UI: `SourceWorkbookDialog` on Project Source page.

## Operational export (export-only)

No import. For audit / human review.

| Data type | Sheet / CSV | Columns |
|-----------|-------------|---------|
| `operational_jobs` | `JOBS` | `job_id`, `project`, `edition`, `chapters`, `worker`, `provider`, `state`, `started`, `completed`, `duration`, `retry_count`, `error` |
| `operational_qa` | `QA` | `project`, `edition`, `chapter`, `paragraph_id`, `issue_type`, `severity`, `message`, `resolved` |
| `operational_activity` | `ACTIVITY_LOG` | `timestamp`, `level`, `module`, `project`, `job`, `message` |
| `operational_conflicts` | `LEARNING_CONFLICTS` | `conflict_id`, `entity_type`, `field`, `old`, `new`, `chapter`, `status` |
| `operational_workbook` | XLSX multi-sheet | All four sheets above |

Security: never exports cookies, tokens, OAuth secrets, browser sessions, or raw credentials. Email addresses are masked by default (`operationalOptions.sanitizeEmail`).

UI: `OperationalExportDialog` on Jobs, Logs, and Learning pages.

## Translation spreadsheet round-trip

Data type `translations` — sheet **TRANSLATIONS** (CSV uses same column headers).

| Column | Import |
|--------|--------|
| `project_id`, `edition_id`, `paragraph_id`, `source_text` | Immutable (warn `SOURCE_CHANGED` if Excel source differs) |
| `translated_text`, `human_locked`, `notes`, `translation_status` | Editable |
| `chapter_number`, `chapter_title`, `qa_status`, `updated_at` | Export metadata / conflict detection |

- Match key: `edition_id` + `paragraph_id` (stable ID e.g. `[C000001:P000001]`)
- Unknown `paragraph_id` → error row
- Text change → `HUMAN_EDIT` version via `appendVersion` (history preserved)
- Conflict: DB `updated_at` newer than export and text differs → `CONFLICT_APP_NEWER`; strategies `KEEP_APP` / `USE_EXCEL`
- XLSX UX: frozen header, auto-filter, wrapped source/translation, column widths; optional `QA_ISSUES` / `TERMS_REFERENCE` sheets (export only)
- UI: `TranslationSpreadsheetDialog` on Translation Editor (requires active edition)

## UI

`TabularImportExportDialog` on Terms page (characters can reuse the same component with `dataType="characters"` + `projectId` / `editionId`).

`TranslationSpreadsheetDialog` on Translation Editor for bulk Excel/CSV edit workflows.

## Performance targets

Designed for large files parsed off the UI thread:

- 100k CSV rows
- 20k XLSX rows

Run `tests/unit/tabular/tabular-import-export.test.ts` for parser/delimiter/BOM coverage.

Run `tests/unit/tabular/character-workbook.test.ts` for character workbook round-trip and conflict rules.

Run `tests/unit/tabular/translation-spreadsheet.test.ts` for translation round-trip, conflict detection, and Unicode.

Set `TABULAR_PERF=1` to run 50k-paragraph round-trip perf test.
