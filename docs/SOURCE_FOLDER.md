# Source Folder Workflow

Khepree Novel AI V1 uses **one project → one source folder → many TXT chapter files**.

## Flow

1. Create project wizard → pick folder → scan preview → import chapters + metadata into SQLite.
2. While running, `chokidar` watches the folder (debounced, stability check).
3. On startup, projects with `scan_on_startup` run background rescan.
4. SQLite remains source of truth; missing files mark `SOURCE_MISSING` without deleting translations.

## Recommended folder layout

```
TienNghich/
├── _BOOK_INFO.txt       # optional project metadata
├── _SUMMARY.txt         # optional official summary document
├── _AUTHOR_NOTE.txt     # optional author note
├── 000000_Prologue.txt  # optional prologue chapter
├── 000001.txt
├── 000002.txt
└── ...
```

Files starting with `_` are treated as **metadata or documents**, not normal chapters.

See also: [BOOK_METADATA.md](./BOOK_METADATA.md)

## Classification

`source-file-classifier.ts` priority:

1. `_` prefix and special names (`_BOOK_INFO`, `_SUMMARY`, …)
2. Document semantics (`内容简介`, `作者的话`, `前言`, …)
3. Prologue / epilogue / extra filenames (`序章`, `番外`, `终章`, …)
4. Chapter filename / heading detection (`chapter-file-detector.ts`)
5. `UNKNOWN` — not silently imported as chapter

## Detection (chapters)

`chapter-file-detector.ts` priority:

1. Filename patterns (`000001.txt`, `Chuong_501.txt`, `第501章 …`)
2. First heading lines (`第…章`, `Chapter N`)
3. Conflict if filename and heading disagree

## Settings (per project)

| Setting | Default |
|---------|---------|
| watch_folder_enabled | true |
| scan_on_startup | true |
| auto_import_new_chapters | false |
| auto_queue_new_chapters | false |
| auto_translate_new_chapters | false |

## Legacy

Projects imported from a single file keep `source_mode = LEGACY_IMPORT` until user binds a folder.

## In-app help

| Article ID | Topic |
|------------|-------|
| `book-metadata-prep` | Preparing book metadata |
| `book-info-file` | `_BOOK_INFO.txt` format |
| `prologue-preface` | Prologue vs preface |
| `project-info` | Project info tab |
| `source-file-types` | Source file classification |
| `book-profile` | Book Profile & Drive files |
