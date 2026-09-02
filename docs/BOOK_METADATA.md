# Book Metadata Architecture

Khepree Novel AI separates **project metadata**, **auxiliary documents**, and **chapters**.

## Principles

- Metadata is **not** stored as chapters.
- `official_summary` (from `_BOOK_INFO.txt` or user input) is separate from `story_states` (current story memory updated during translation).
- Preface / author notes are **documents**; 序章 / 楔子 / 引子 are usually **prologue chapters**.

## Database (migration 015)

### `projects` extended fields

`title_cn`, `title_vi`, `author_name`, `genre`, `subgenres`, `publication_status`, `expected_chapter_count`, `introduction`, `official_summary`, `notes`, `metadata_source`, `metadata_fields`, `book_profile_dirty`, …

### `project_documents`

Auxiliary text files: `BOOK_INFO`, `OFFICIAL_SUMMARY`, `AUTHOR_NOTE`, `PREFACE`, etc.

### `chapters` extended

- `chapter_type`: `NORMAL | PROLOGUE | EPILOGUE | EXTRA | …`
- `sequence_order`: primary ordering (prologue = 0, then chapter 1, 2, …)
- `chapter_number`: nullable for prologue / extras
- `display_title`: UI label (e.g. "Chương mở đầu")

## Source folder classification

Priority: filename conventions → semantics → heading → confidence.

| File | Classification |
|------|----------------|
| `_BOOK_INFO.txt` | BOOK_METADATA |
| `_SUMMARY.txt` | PROJECT_DOCUMENT (OFFICIAL_SUMMARY) |
| `序章.txt` | PROLOGUE |
| `000001.txt` | CHAPTER |
| `番外1.txt` | EXTRA |
| Unknown | UNKNOWN (not auto-imported as chapter) |

## `_BOOK_INFO.txt`

Optional key/value file (VI / ZH / EN keys). Parsed by `book-info-parser.ts`. Unrecognized fields go to `notes`.

## Metadata priority

`USER_EDIT` > `PROJECT_CONFIRMED` > `BOOK_INFO_FILE` > `AUTO_DETECTED`

Locked / user-confirmed fields are not overwritten on rescan.

## Book Profile (AI)

`BookProfileBuilder` produces compact `[BOOK PROFILE]` text for TranslationPack (configurable char budget). Full descriptions are **not** sent on every batch.

## Notebook / Drive

`00_BOOK_PROFILE.md` — stable metadata snapshot  
`01_TRANSLATION_RULES.md` … `05_STORY_STATE.md` — knowledge layers

Story state remains in `05_STORY_STATE.md`, not mixed into book profile.

## UI

- Create Project Wizard: metadata preview after folder scan
- `/projects/:id/info` — edit metadata, list documents, sync Notebook
- `/projects/:id/source` — folder path, scan summary stats, resync / import new chapters

## Tests

- `tests/unit/source-folder/book-metadata.test.ts` — parser, classifier, profile builder
- Help: `tests/unit/help-center.test.ts` — metadata article search

## In-app help

| Article ID | Topic |
|------------|-------|
| `book-metadata-prep` | Chuẩn bị thông tin truyện |
| `book-info-file` | `_BOOK_INFO.txt` format |
| `prologue-preface` | Prologue vs preface |
| `project-info` | Tab Thông tin truyện |
| `source-file-types` | Source folder scan & classification |
| `book-profile` | Book Profile & Notebook Drive files |

User-facing guide lives in **Help → Dự án / Notebook** (`src/renderer/features/help/content/book-metadata.ts`).
