# Translation Workspace Layout Audit

Date: 2026-08-28  
Scope: Translation Editor Phase 2 — content-first workspace. Source / Translation must dominate.

Live Electron screenshots were **not** captured in this pass (desktop app; no attached renderer session). Measurements below are from the shipped CSS/grid after the layout change, at 100% Windows scaling.

---

## Before (permanent chrome)

Idle editor at **1366×768**, sidebar expanded, chapter rail expanded, context **intended** collapsed:

| Chrome | Height | Width stolen from editor |
|--------|--------|--------------------------|
| Title bar | 30px | — |
| Command bar | 38px | — |
| Version History footer | up to **160px** (`max-height: 10rem`) | full editor width |
| Search row | overlay already (0 idle) | — |
| Spreadsheet row | three wrapping buttons inside ⋯ | wrap risk |
| Right “collapsed” context | **280px** reserved | grid used `--context-panel-width` even when collapsed |

**Visible editor (before):**

- Page height: 768 − 30 title = **738px**
- After command bar: 738 − 38 = **700px** workspace
- After version footer: 700 − 160 = **~540px** editor body (~**73%** of translation page; **~69%** of window)
- Editor column width: 1366 − 200 sidebar − 200 chapter − **280 context** = **686px** (~50% of window)

That 280px empty rail is the giant blank pane and the full-workspace horizontal scrollbar.

---

## After (content-first)

Same 1366×768, sidebar expanded, chapter rail expanded (~190–200px), context **collapsed 38px**, idle (no job, no error banner, search closed):

| Chrome | Height | Width |
|--------|--------|-------|
| Title bar | 30px | 1366 |
| Command bar | 38px, one row, `nowrap` | remaining |
| Version History | **0** until ⋯ / row action opens Drawer | portal |
| Search | **0** until Ctrl+F / Ctrl+H overlay | overlay |
| Spreadsheet | **0** until ⋯ → Dữ liệu Excel/CSV | Drawer |
| Job strip | **0** idle; ≤28px when a real job runs | — |
| Context rail | — | **38px** |
| Chapter rail | — | **190–200px** |

**Visible editor (after, idle):**

- Workspace: **700px**
- Column headers ~28px
- Editor list: **~672px** → **~91%** of translation page height (**>80%** target)
- Editor column width: 1366 − 200 − 200 − 38 = **928px** (~68% of window)

| Viewport | Sidebar | Chapter | Context | Editor column (approx) |
|----------|---------|---------|---------|------------------------|
| 1366×768 | 200 | 200 (190 cap) | 38 collapsed | **928** |
| 1600×900 | 200 | 200 | 38 | **1162** |
| 1920×1080 | 200 | 200 | 38 | **1482** (1fr fills; no leftover blank rails) |
| 2560×1440 | 200 | 200 | 38 | **2122** |
| Focus mode | 0 | 0 | 0 | full remaining |

Expanded context: **280–340px** (persisted). Does **not** auto-open when empty.

Collapsed chapter rail: **38px**. Preference persisted.

---

## Requirement map

1. **Version History** — removed from `BilingualEditor` footer. Row action **Lịch sử phiên bản** opens Drawer. `listVersions` only while open.
2. **Context default** — `contextCollapsed: true`, persisted. Rail 38px / panel 280–340.
3. **Smart context** — tabs Nhân vật / Thuật ngữ / Quan hệ / Bộ nhớ with counts. Paragraph filter; term/character click opens detail drawers.
4. **Empty context** — compact “Chưa có ngữ cảnh liên quan cho đoạn này.” No 280px empty pane.
5. **Search** — overlay only. Ctrl+F find, Ctrl+H replace, Escape closes. Ctrl+Shift+F is Focus Mode (no longer stolen by Ctrl+F).
6. **Spreadsheet** — ⋯ → **Dữ liệu Excel/CSV** Drawer. No permanent Excel/CSV row.
7. **Banners** — error/action-required banner only. Success/save is toast/chip. Job is thin strip.
8. **Job strip** — ≤28px, real `measureJobProgress`, **Tạm dừng** / **Tiếp tục**. Absent when no job.
9. **Command bar** — one row. Copy/Export labels hide ≤1366 so CTA **Dịch tiếp** stays. Secondary in ⋯.
10. **Memory** — chip **Bộ nhớ ✓**, tooltip “Bộ nhớ cục bộ đang hoạt động.” No version numbers.
11. **Save** — idle/dirty quiet; saving spinner; error visible; “Đã lưu” fades.
12. **Focus mode** — hides global sidebar, chapter rail, context. Keeps command bar + editor. Ctrl+Shift+F. Menu: Chế độ tập trung.
13. **Chapter rail** — collapse 38px / expand 190–220, persisted.
14. **Center width** — `minmax(0,1fr)` editor column; collapsed context no longer 280px.
15. **Height** — no version footer / search / spreadsheet in idle layout. Editor **>80%** page height.
16. **Overflow** — workspace `overflow: hidden`; columns `min-width: 0`; editor `overflow-x: hidden`; overlays portaled.
17. **Responsive** — 1366 toolbar nowrap via icon-only Copy/Export. Grid stays three columns with `minmax(0,1fr)`.

---

## Files

- `src/renderer/styles/ui.css` — workspace grid (rail vs expanded panel)
- `src/renderer/components/translation/BilingualEditor.tsx` — on-demand history Drawer
- `src/renderer/components/editor/EditorContextPanel.tsx` — counts, empty, clicks
- `src/renderer/stores/translation-workspace-store.ts` — width clamps
- `docs/TRANSLATION_WORKSPACE_LAYOUT_AUDIT.md` — this file
