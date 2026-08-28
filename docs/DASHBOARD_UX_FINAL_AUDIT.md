# Dashboard UX Final Audit

Date: 2026-08-28  
Route: `/` → `DashboardPage` (single canonical implementation)

## Summary

Dashboard redesigned from system monitor → **action center**. One priority project card, conditional sections only, canonical readiness resolver, fixed global breadcrumb.

## Acceptance checklist

| Requirement | Status |
|-------------|--------|
| Global `/` breadcrumb = "Tổng quan" only (no stale project name) | ✅ `resolveBreadcrumb` |
| Onboarding hidden after first translation + AI ready | ✅ `resolveDashboardReadiness` + `DashboardOnboarding` |
| Notebook not shown as dashboard warning | ✅ Removed health row from priority card |
| Raw memory version (v65) not on default dashboard | ✅ Removed from UI |
| Empty Running Jobs section removed | ✅ `RunningJobsSection` returns null when empty |
| Priority card has clear Dịch tiếp CTA | ✅ `ContinueProjectCard` |
| Progress = `translatedChapterCount / sourceChapterCount` | ✅ `projectProgressPercent` |
| Optional API failure does not blank dashboard | ✅ `Promise.allSettled` in `useDashboardData` |
| 1366×768: header + priority CTA above fold | ✅ Compact card, ~20px padding, max-width 1400px |

## Layout priority (top → bottom)

1. Header — "Tiếp tục công việc gần nhất và những việc cần chú ý."
2. Ready banner / onboarding (conditional)
3. Compact summary strip
4. **Continue project** (full-width priority card)
5. **Cần chú ý** (only if actionable)
6. **Đang dịch** (only if jobs running)
7. **Gần đây** (when no running jobs)

## Component structure

```
DashboardPage
├── DashboardHeader
├── DashboardOnboarding
├── DashboardSummaryStrip
├── ContinueProjectCard
├── ActionRequiredSection
├── RunningJobsSection
└── RecentActivitySection

Hooks / services:
├── useDashboardData
├── resolveBreadcrumb
├── resolvePriorityProject
├── resolveDashboardActions
├── resolveDashboardReadiness
└── resolveRecentActivity
```

## Breadcrumb rules

| Path | Breadcrumb |
|------|------------|
| `/` | Tổng quan |
| `/projects` | Dự án |
| `/projects/:id/...` | Dự án / {project} (project workspace uses CompactProjectBar) |
| `/translation` + active project | Dịch truyện / {project} |
| `/jobs` | Công việc |

## Onboarding required steps

1. AI sẵn sàng  
2. Dự án đầu tiên  
3. Nguồn truyện  
4. Bản dịch đầu tiên  

Research Notebook / manual memory setup **not** required.

## Priority project policy

1. `lastTranslationProjectId`  
2. `currentProjectId`  
3. Most recently updated incomplete project  
4. Most recently created project  

## Progress data

- `sourceChapterCount` — total chapters in project  
- `translatedChapterCount` — chapters with all paragraphs translated  
- `nextUntranslatedChapter` — DB resolver (handles non-contiguous gaps)  
- Job progress — `paragraphsDone/Total` or `chunkIndex/chunkTotal`; never `attemptCount * 20`

## Statusbar (novice mode)

When `showAdvancedTools=false`:
- Hide "CSDL: Sẵn sàng"
- Show idle / running jobs + account issue warning only

## Test matrix (automated)

`tests/unit/renderer/dashboard/dashboard-resolvers.test.ts` covers:

- Breadcrumb regression (stale project on `/`)
- Priority project selection
- Real progress ratio
- Onboarding completion / no notebook requirement
- Action section empty when healthy
- No notebook/v65 warnings
- Recent activity from completed jobs
- `nextUntranslatedChapter` non-contiguous

`tests/unit/shared/job-progress.test.ts` — no fake attemptCount progress.

## Screenshots

Not captured in CI environment (Electron desktop). Manual verification recommended:

- First run (onboarding visible)
- Normal 15/184 state
- Action required (terms / login)
- Running job
- Completed project
- 1366×768 / 1920×1080 viewports

## Removed / deprecated

- Multi-project "Up next" list (replaced by single priority card)
- Permanent health row (Notebook, Google, v65 memory)
- Empty states for Running / Action Required sections
- Old subtitle: "Dịch tiếp dự án ưu tiên — sức khỏe và tiến trình thật."
