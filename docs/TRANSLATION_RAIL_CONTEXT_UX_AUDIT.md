# Translation Rail + Context UX Audit (Phase 5)

Audit date: 2026-08-29  
Scope: Chapter rail header, collapse control, context panel, editor width priority.

## Summary

Phase 5 fixes icon overlap in the chapter header, moves collapse to the rail edge, puts filter inside search, and gives the bilingual editor more horizontal space via narrower context defaults and overlay mode on small viewports.

## Before → After

### Chapter header (≈190px rail)

**Before (single row, 5 columns):**

```
[Chương 3/184] [Search........] [Filter] [Collapse] [⋯]
```

Icons overlapped at 1366×768.

**After (stacked, 2 rows):**

```
Row 1: Chương    3 / 184              [⋯]
Row 2: [🔍 Tìm chương.............. [Filter]]
```

- Filter: trailing action inside search input
- Collapse: edge button on chapter/editor divider (`‹` / `›`, 28px hit area)
- Secondary actions: ⋯ menu only (select multiple, next untranslated, export folder, …)

### Chapter row labels

| Case | Before | After |
|------|--------|-------|
| No title | `3` or `3 · Chương` | `Chương 3` |
| With title | `3 · Mở đầu` | `Chương 3 · Mở đầu` |

Formatter: `formatChapterDisplayLabel()` in `chapter-utils.ts`.

### Context panel

| Setting | Before | After |
|---------|--------|-------|
| Default collapsed | ✓ | ✓ (enforced + migrate v2) |
| Expanded width | 280–340px | 240–360px (default 260) |
| ≤1366 cap | 280 min | max 260px |
| ≤1200 width | persistent column | overlay drawer |
| Header | "Thông tin" + "Ẩn ngữ cảnh" button | "Ngữ cảnh" + × icon |
| Collapsed rail | Brain icon | Brain + count badge when items > 0 |
| Empty state | one line | message + secondary hint |
| Tabs | all with 0 counts | hide zero-count tabs (except active) |

## Layout widths

| Viewport | Chapter rail | Context (expanded) |
|----------|--------------|-------------------|
| ≤1366 | cap 190px (stored 160–320) | cap 260px |
| ≥1920 | prefer 210–230 | up to 360px |
| <1200 | same | overlay drawer, editor full width |

Store: `translation-workspace-store` v2 migrate reclamps legacy widths.

## Editor priority (target)

| Viewport | Sidebar + chapter rail + context collapsed | Editor ~share |
|----------|---------------------------------------------|---------------|
| 1366×768 | expanded / expanded / collapsed | ≥70% content |
| 1920×1080 | same default | ≥75% preferred |

Grid uses `minmax(0, 1fr)` on editor column; context overlay mode removes third column width cost.

## Test matrix

| Case | Status |
|------|--------|
| 1366 / 1600 / 1920 header — no icon overlap | ✓ stacked header tests |
| 184 / 5000 chapters virtualized | ✓ existing + layout tests |
| Filter active + chip | ✓ |
| Search active | ✓ |
| Selection mode | ✓ |
| Context 0 / 1 char / many terms | ✓ editor-context-panel |
| Context collapsed / expanded | ✓ store defaults |
| Responsive context drawer | ✓ CSS + TranslationWorkspace overlay |

## Files changed

- `ChapterNavigator.tsx` — 2-row header, filter in search, display formatter
- `TranslationWorkspace.tsx` — edge collapse, context overlay, resolved widths
- `ContextDrawer.tsx` — simplified header, badge, overlay variant
- `EditorContextPanel.tsx` — smart tabs, empty hint
- `chapter-utils.ts` — `formatChapterDisplayLabel`
- `translation-workspace-layout.ts` — width helpers (new)
- `translation-workspace-store.ts` — clamps, migrate v2
- `SearchInput.tsx` — `trailingAction` prop
- `ui.css`, `global.css`, `tokens.css` — layout + header styles
- `en.ts`, `vi.ts` — new strings
- Tests under `tests/unit/translation/`, `tests/unit/editor/`

## Quality gate

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run package
```

## Screenshot checklist (manual)

- [ ] 1366×768 — header rows, no overlap
- [ ] Filter popover from search trailing icon
- [ ] Edge collapse toggle visible on divider
- [ ] Context collapsed — brain icon only / badge when data
- [ ] Context expanded — compact tabs, no "Thuật ngữ 0"
- [ ] ≤1200 — context opens as right overlay
- [ ] Long chapter title ellipsis in row
