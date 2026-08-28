# Help System

> In-app user guide — Vietnamese content, local search, no external docs required.

## Architecture

```
src/renderer/features/help/
  HelpPage.tsx           # Layout shell
  HelpContextButton.tsx  # ? icon + Learn more link
  types.ts               # Article / block schema
  content/
    index.ts             # Registry, search, route/error maps
    intro.ts             # Intro + quick start
    accounts.ts          # Google accounts, browser profiles
    projects.ts          # Projects + import
    book-metadata.ts     # Metadata, _BOOK_INFO, prologue
    translation.ts       # Translation, notebook, editor, QA
    terms-memory.ts      # Terms + characters + memory
    operations.ts        # Jobs, logs, backup, export
    troubleshooting.ts # Errors + FAQ + shortcuts + glossary
  components/
    HelpArticle.tsx      # Block renderer
    HelpChecklist.tsx    # Live setup checklist
    HelpSearch.tsx       # Sidebar + search UI
```

Styles: [`src/renderer/styles/help.css`](../src/renderer/styles/help.css)

UI strings (not article body): `i18n` namespace `help.*`

## Article schema

Each article:

| Field | Purpose |
|-------|---------|
| `id` | URL slug `/help/:id` |
| `categoryId` | Sidebar grouping |
| `title`, `description` | Headings + search |
| `keywords[]` | Local search index |
| `order` | Sort within category |
| `relatedIds[]` | Footer links |
| `blocks[]` | Render tree |

Block types: `heading`, `paragraph`, `list`, `steps`, `callout`, `actions`, `table`, `faq`, `code`.

## Search

Client-only scoring on title, keywords, description, block text. No AI / network.

## Deep linking

| Source | Map |
|--------|-----|
| Route | `ROUTE_HELP_ARTICLE` + patterns (`/projects/:id/info` → `project-info`, `/projects/:id/source` → `source-file-types`) |
| Error code | `ERROR_HELP_ARTICLE` → troubleshooting articles |
| F1 | `helpArticleForRoute(location.pathname)` |
| Context `?` | Per-page `articleId` prop |

## Setup checklist

`useHelpChecklist()` reads real state via IPC:

- accounts.list → Google added / READY
- Google account READY status (browser profile usable)
- projects.list → project exists
- setup.getStatus().notebookReadyCount
- jobs.list → any COMPLETED job

Shown on **Bắt đầu nhanh** and **Giới thiệu**.

## Adding an article

1. Add `HelpArticle` object in appropriate `content/*.ts`
2. Ensure `categoryId` exists in `HELP_CATEGORIES`
3. Add `relatedIds` on related articles
4. Optional: add route/error map entry
5. Add test keyword in `tests/unit/help-center.test.ts` if critical

| `source-file-types` | Source file classification |

## Book metadata articles (2026-08)

| ID | Title |
|----|-------|
| `book-metadata-prep` | Chuẩn bị thông tin truyện |
| `book-info-file` | File `_BOOK_INFO.txt` |
| `prologue-preface` | Chương mở đầu và lời nói đầu |
| `project-info` | Tab Thông tin truyện |
| `source-file-types` | Phân loại file nguồn |
| `book-profile` | Book Profile và file Notebook |

Route context: `/projects/:id/info` → `project-info`; `/projects/:id/source` → `source-file-types`.

## Localization

Article body is Vietnamese in content files (product copy). Shell uses `t('help.*')`. English stub mirrors keys only — articles stay VI until EN help is requested.
