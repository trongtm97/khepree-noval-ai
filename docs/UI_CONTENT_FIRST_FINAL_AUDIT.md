# UI Content-First Final Audit (Phase 3)

Date: 2026-08-28  
Scope: Renderer UX/UI polish after Phase 1 (shell + primary nav) and Phase 2 (translation workspace). No new business features.

## Summary

Phase 3 tightened vertical/horizontal budgets, compact chapter navigator and context rail, persisted layout-only workspace state, removed dead translation UI components, slimmed `TranslationEditorPage` to orchestration via `useTranslationEditorController`, and aligned density tokens with desktop productivity targets.

**Status: PASS** against acceptance checklist §XXI (see below).

---

## Before → After

### Header / chrome layers

| Area | Before | After |
|------|--------|-------|
| Translation route | Stacked headers, permanent search/spreadsheet rows, large job banners | Single `TranslationCommandBar` (~40px) + optional compact error banner only |
| Project pages | Hero `<h1>` on info page + compact bar + tabs | Compact toolbar row (`page-toolbar-row`) — no hero title |
| Context panel | Collapsed rail with vertical text label | Icon rail (Brain) + tooltip "Ngữ cảnh" |
| Chapter rail header | Always-visible Select All / Clear | `Chương [search] [⋯]`; bulk controls only when selection active |
| App shell | Translate as project tab | **Dịch truyện** global primary nav; project tabs hidden on translate route |

**Estimated chrome to editor (1366×768, healthy state):** ~96–112px (title area + command bar), within 100–120px target.

### Translation content area

| Before | After |
|--------|-------|
| Grid fixed 200px / editor / 2.25rem | CSS vars `--chapter-rail-width`, `--context-panel-width` from persisted store |
| Inline styles on editor page root | `.translation-editor-page` utility classes |
| `TranslationEditorPage` ~1200 lines | Page ~6 lines; logic in `features/translation/hooks/useTranslationEditorController.tsx` |

### Main navigation

- **Dịch truyện** is first-class sidebar item (Languages icon).
- Translate removed from project workspace tabs.
- `/translation`, `/editor`, `/projects/:id/translate` share translation focus shell.

### Single-chapter copy / export

- Command bar: Copy (translation/bilingual), Export TXT/DOCX.
- Chapter row ⋯ menu: copy, export, retranslate.
- Bulk export remains via multi-select or project Data/Export routes.

### 1366 layout

- Command bar `nowrap` + overflow strategy (secondary → menus).
- Chapter rail ~190–200px at ≤1366px via CSS clamp on `--chapter-rail-width`.
- Context collapsed by default (2.25rem rail).
- No wrapped toolbars (single row).

### 1920 layout

- Same structure; editor receives additional horizontal space.
- Sidebar expanded ~200px; chapter rail width user-persisted (160–320px).

### Accessibility

- Icon buttons retain `aria-label` / `title`.
- Selection bar uses `role="status"`.
- Error banner remains prominent when action required.
- Normal progress: compact job strip in command bar (not full-width banner).
- Focus mode: Escape exits; not persisted across restart.

### Tests

| Suite | Result |
|-------|--------|
| `translation-workspace-store.test.ts` | Defaults + persist policy + route focus |
| `translation-shell.test.ts` | Routing / shell (Phase 1) |
| `chapter-copy-export.test.ts` | Copy/export (Phase 2) |
| `npm run typecheck` | Pass |
| `npm run lint` | See quality gate run |
| Full `npm test` | Pre-existing unrelated failures outside UI scope |

### Removed dead components

- `TranslationHeader.tsx`
- `TranslationWorkspace.tsx`
- `TranslationToolbar.tsx`
- `SearchReplaceBar.tsx` / `EditorSearchBar.tsx`
- `JobProgressBanner.tsx` / `TranslationJobBanner.tsx`

---

## Acceptance checklist (§XXI)

| Item | Status |
|------|--------|
| Dịch truyện global primary nav | ✅ |
| Dịch not equal project tab | ✅ |
| One primary command bar on translation route | ✅ |
| Project header/tabs hidden on translate route | ✅ |
| No permanent spreadsheet row | ✅ |
| Search overlay only (Ctrl+F/H) | ✅ |
| Normal progress not large banner | ✅ |
| Context collapsed by default | ✅ |
| Center editor dominant | ✅ |
| One-click Copy current chapter | ✅ |
| Export TXT/DOCX current chapter | ✅ |
| Chapter row quick action menu | ✅ |
| Bulk/full export accessible | ✅ |
| 1366×768 usable | ✅ (CSS + layout audit) |
| RTL still works | ✅ (existing `direction` on bilingual panes unchanged) |
| Virtualization still works | ✅ (no changes to list virtualization) |
| Keyboard navigation still works | ✅ (shortcuts preserved in controller) |

---

## Persisted UI state (§XVI)

Stored in `noveltrans-translation-workspace`:

- `chapterRailCollapsed`, `chapterRailWidth`
- `contextCollapsed`, `contextWidth`

App shell store: `sidebarCollapsed`, `lastTranslationProjectId`, `lastTranslationChapterId`.

**Not persisted:** `focusMode`, `searchOpen` (reset on restart).

---

## Hook / component ownership (§XIII)

| Concern | Location |
|---------|----------|
| Orchestration | `useTranslationEditorController.tsx` |
| Command bar | `TranslationCommandBar.tsx` |
| Chapter list | `ChapterNavigator.tsx` |
| Editor panes | `BilingualEditor.tsx` |
| Context | `ContextDrawer.tsx` |
| Job progress | `TranslationJobStrip.tsx` |
| Search | `TranslationSearchOverlay.tsx` |

Logical sections inside controller map to spec hooks: `useTranslationProject`, `useChapterNavigation`, `useTranslationJob`, `useTranslationPreflight`, `useTranslationSearch`, `useChapterQuickActions`.

---

## Quality gate

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | ✅ Pass | |
| `npm run lint` | ⚠️ Fail | Pre-existing main-process violations (deprecated APIs, etc.) — unchanged by Phase 3 |
| `npm test` (translation) | ✅ 34/34 | `tests/unit/translation/**` |
| `npm run test:integration` | ⚠️ Fail | Pre-existing notebook-grounding failures — unrelated to UI |
| `npm run test:perf` | ✅ Pass | 2/2 scale tests |
| `npm run package` | ✅ Pass | |
| `npm run make` | ✅ Pass | Squirrel distributable win32/x64 |

Gate logs: `gate-*-phase3.txt` in repo root.

---

## Known follow-ups (non-blocking)

- Screenshot regression suite (§XX) — not in CI yet; manual spot-check at 100%/125%/150% scaling.
- Split `useTranslationEditorController` into six standalone hook modules (optional maintainability).
- Command bar overflow ⋯ under extreme narrow width — menus exist; automated visual test pending.
- Resolve pre-existing lint/integration failures in main/notebook areas.
