# Projects Page UI Audit

## Before issues

- Six equal-weight action buttons per card (Open, Continue, AI Memory, Info, Source, Delete).
- Delete exposed as permanent danger button on every card.
- Notebook status shown on every healthy project card.
- Grid default with ~300px cards leaving large empty workspace on wide screens.
- Three top-level header buttons competing with Create Project.
- Breadcrumb on `/projects` showed stale `currentProjectName` from persisted shell state.
- Raw DB status (`draft`) displayed as accent badge "Không xác định".
- Language pair shown as two disconnected stacked lines.
- Sort by "progress" used `sourceChapterCount` instead of translation ratio.
- Import/restore wizards rendered inline, shifting page layout.
- No relative "updated" timestamps.
- No search-empty state distinct from no-projects state.

## After design

### Page header
- Compact title + one-line summary (`N dự án · M chương · …`).
- Primary CTA: `+ Tạo dự án` only.
- Overflow `⋯` menu: Nhập dự án cũ…, Khôi phục bản sao lưu…
- Help icon retained as secondary.

### Toolbar
- Single row: search (280–360px), sort (200px), segmented list/grid toggle.
- Default view: **list** (persisted in `khepree-novel-ai-ui-shell` as `projectsViewMode`).
- Ctrl+F focuses search on Projects page.

### Project cards
- **List mode**: full-width rows (~130–160px), max container 1400px.
- **Grid mode**: `repeat(auto-fill, minmax(360px, 1fr))`.
- Title 18px semibold, clickable → open project.
- Inline language pair: `Chinese (Simplified) / 简体中文 · zh-Hans → …`
- Derived user-facing status (Sẵn sàng, Đang dịch, Cần thiết lập, Có lỗi, …).
- Progress: `done / total chương`, bar, percentage, relative updated time.
- `nextUntranslatedChapter` when provided by backend (no `done+1` guess).
- Primary: **Tiếp tục dịch →** / **Bắt đầu dịch →**; secondary: Mở dự án.
- Overflow `⋯` via `DropdownMenu` portal: info, source, AI memory, data, export path, delete.
- Active job banner with monitor link; health alerts only when action required.
- Notebook status removed from default card surface.

### Breadcrumb
- `/projects` → `Dự án` only.
- `/projects/:id/...` → `Dự án / {projectName}`.

### Wizards
- Create/import wizards in `ModalPortal` — no inline layout shift.

## Functional changes

| Area | Change |
|------|--------|
| Components | Extracted `ProjectsPageHeader`, `ProjectsToolbar`, `ProjectListItem`, `ProjectGridCard`, `ProjectActionsMenu` |
| Status | `resolveProjectDisplayState()` from health + jobs + chapter stats |
| Sort progress | `translatedChapterCount / sourceChapterCount` |
| i18n | Legacy import renamed user-facing; new status/activity strings |
| Persistence | `projectsViewMode` in ui-shell store |
| Export | Menu item calls `portability.openExportDirectory` |

## Responsive results

| Viewport | Result |
|----------|--------|
| 1366×768 | Header/toolbar wrap gracefully; list rows stack actions on narrow footer |
| 1920×1080 | Content capped at 1400px; actions right-aligned in list rows |
| 1 project | Full-width list row — no tiny centered card |
| Many projects | Standard list/grid; search + sort client-side |

## Tests added

- `tests/unit/renderer/projects/project-status.test.ts`
- `tests/unit/renderer/projects/format-relative-date.test.ts`
- `formatLanguagePairInline` in `language-profile.test.ts`

## Quality gate

- `npm run typecheck` — pass
- `npm run lint` — pre-existing repo violations only (no new Projects files flagged)
- `npm test` — blocked by broken local `vitest` module in `node_modules` (environment); run `npm install` to restore
