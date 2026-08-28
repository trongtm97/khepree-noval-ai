# Project Workspace UX Audit — Phase 1

Date: 2026-08-28  
Scope: Unified project navigation for non-technical users (renderer only; business logic unchanged)

## Summary

Phase 1 consolidates project chrome, removes duplicate identity in the app topbar, reorders workspace tabs, introduces a shared section header pattern, and gates advanced/technical affordances behind a user setting.

## Before (production baseline)

| Area | Issue |
|------|-------|
| App topbar | `Dự án / {projectName}` duplicated CompactProjectBar title + language pair |
| Tab order | Overview → Chapters → AI Memory → Terms → Characters → Data |
| Page headers | 3 patterns: `page-toolbar-row`, `PageHeader` (h2+subtitle), `ai-memory-header` (h1) |
| Open translator | Shown in CompactProjectBar **and** ProjectInfoPage / ProjectSourcePage |
| Vertical chrome | ~114px (topbar 36 + bar 44 + tabs 34) before page content; Pages added ~60px more |
| AI Memory width | `max-width: 42rem` (~672px) on wide screens |
| Advanced tools | Always visible (JSON export, promote, technical memory panels) |
| Copy | English jargon: Story State, Recent Context, FULL Research, etc. |

## After (Phase 1)

### Navigation & chrome

- **`/projects/:id/*`**: topbar left empty — system/status actions stay right only
- **`/projects`**: breadcrumb unchanged (`Dự án`)
- **`PROJECT_TABS` order**: Tổng quan → Chương → Thuật ngữ → Nhân vật → Bộ nhớ AI → Dữ liệu (routes unchanged)
- **CompactProjectBar**: back · title · language pair · spacer · edition · + Ngôn ngữ · Mở trình dịch (~44px)
- **Tabs**: ~34px; total project chrome ~78px
- **`main-content--project`**: removes outer main padding; body scrolls inside workspace

### Shared page pattern

- **`ProjectSectionHeader`**: title · optional description · help · max 1 primary · 1 secondary · ⋯ overflow (DropdownMenu / overlay portal)
- All six workspace pages use `project-page` wrapper (`max-width: 1400px`) + `ProjectSectionHeader`
- **Mở trình dịch** only on CompactProjectBar (empty/error CTAs on pages unchanged)

### Settings

- **`showAdvancedTools`** in `ui-shell-store` (persisted, default `false`)
- Toggle: Cài đặt → Giao diện → Nâng cao → “Hiển thị công cụ nâng cao”
- When OFF: JSON export, promote-to-global, raw story-state JSON, AI memory technical panels hidden
- When ON: shown in Advanced sections / overflow menus

### Plain Vietnamese (examples)

| Before | After |
|--------|-------|
| FULL Research | Phân tích toàn truyện |
| Story State | Trạng thái truyện |
| Recent Context | Bối cảnh gần đây |
| Candidates (tab) | Gợi ý AI |
| Conflicts (tab) | Cần xử lý |

### Status UX

- Healthy AI memory: compact quiet text instead of green badges
- Warnings/errors remain prominent (ErrorPanel, warning badges)

### Responsive

- `@media (max-width: 1366px)`: title/pair ellipsis; edition select narrows
- Tabs: `flex-wrap: nowrap` + horizontal scroll; overflow actions → ⋯ menu

## Files touched

| File | Change |
|------|--------|
| `src/renderer/layouts/AppShell.tsx` | No project breadcrumb; `main-content--project` |
| `src/renderer/layouts/ProjectWorkspace.tsx` | Tab reorder |
| `src/renderer/components/shell/CompactProjectBar.tsx` | Spacer, pair tooltip |
| `src/renderer/components/shell/ProjectSectionHeader.tsx` | **New** shared header |
| `src/renderer/stores/ui-shell-store.ts` | `showAdvancedTools` |
| `src/renderer/pages/*` (6 project pages) | ProjectSectionHeader, dedupe CTA |
| `src/renderer/pages/SettingsPage.tsx` | Advanced tools toggle |
| `src/renderer/styles/global.css` | Layout tokens, header, responsive |
| `src/renderer/i18n/vi.ts`, `en.ts` | Labels + settings strings |

## Routes unchanged

All existing paths preserved (`/info`, `/source` legacy aliases still active-match tabs).  
`/projects/:id/export` remains a route but is not a workspace tab (pre-existing).

## Known follow-ups (out of Phase 1 scope)

- Terms page at project URL still uses global term vault (pre-existing data scope)
- Tab overflow “More” menu at narrow widths (tabs scroll horizontally for now)
- Double-check DataPortabilityCard for advanced JSON paths when `showAdvancedTools` is off

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run package
```

Responsive manual checks: 1366×768, 1600×900, 1920×1080, 2560×1440.
