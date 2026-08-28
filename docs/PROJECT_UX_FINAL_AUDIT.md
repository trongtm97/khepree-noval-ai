# Project UX — Final Audit (Phases 2–4)

Audit date: 2026-08-28  
Scope: Project workspace pages for novice-first Vietnamese UX.

## Screens reviewed

| Screen | Route | Header pattern | Novice-safe | Import/export |
|--------|-------|----------------|-------------|---------------|
| Overview | `/projects/:id/info` | `ProjectSectionHeader` | ✅ Read view default; edit drawer | Overflow only (advanced) |
| Chapters | `/projects/:id/source` | `ProjectSectionHeader` | ✅ Plain metrics + scan CTA | Workbook in overflow (advanced) |
| AI Memory | `/projects/:id/ai-memory` | `ProjectSectionHeader` | ✅ Plain tiles; detail drawer | N/A |
| Terms | `/projects/:id/terms` | `ProjectSectionHeader` | ✅ Empty state + CTA | Compact `Nhập / Xuất` menu |
| Characters | `/projects/:id/characters` | `ProjectSectionHeader` | ✅ Empty state + CTA | Compact `Nhập / Xuất` menu |
| Data | `/projects/:id/data` | `ProjectSectionHeader` | ✅ Category cards + recent ops | Full hub: per-card Nhập + Xuất ▼ |

## Acceptance matrix

### A. Data page

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| A1 | Title **Dữ liệu** + plain subtitle | ✅ | `dataHub.title` / `dataHub.subtitle` |
| A2 | Six category cards with icon, count, desc, Nhập, Xuất ▼ | ✅ | `DataPortabilityCard` |
| A3 | No permanent format button row; export menu xlsx/csv (+ JSON advanced) | ✅ | `DataExportMenu` |
| A4 | Template inside import wizard step 1 | ✅ | `DataImportWizard` |
| A5 | Import preview: file, rows, valid, warning, error, will add/update/skip | ✅ | Step 4 + `import-preview-summary` |
| A6 | Auto export path via `ExportPathResolver` → `<export>/Data/` | ✅ | `data-export-path.ts` |
| A6 | Toast with Mở file / Mở thư mục | ✅ | `ProjectDataPage` banner |
| A7 | Recent operations table + per-row undo on latest | ✅ | `DataRecentOperationsTable` |

### B. Import/export deduplication

| Page | Before | After | Status |
|------|--------|-------|--------|
| ProjectInfoPage | Multiple raw buttons (advanced overflow) | Single `Nhập / Xuất` dropdown | ✅ |
| TermsPage | 3–5 export buttons | `TermVaultTabularDialog` dropdown | ✅ (Phase 3) |
| CharactersPage | Inline CSV/XLSX + undo | `TabularImportExportDialog` dropdown | ✅ |
| SourceWorkbookDialog | CSV/XLSX + global undo | Nhập + Xuất ▼; undo removed | ✅ |

### C. Page structure

| Check | Status |
|-------|--------|
| All project pages use `ProjectSectionHeader` | ✅ |
| No floating mid-page Help icons | ✅ (help on title row) |
| Consistent top spacing via `.project-page` | ✅ |

### D. Help

| Check | Status |
|-------|--------|
| Help icon on section title row | ✅ `ProjectSectionHeader` |
| Tooltip **Xem hướng dẫn** | ✅ `help.openContext` |
| F1 unchanged | ✅ (existing binding) |

### E. Empty states

| Page | What / Why / Action | Status |
|------|---------------------|--------|
| Terms (vault) | Title + novice copy + **Thêm thuật ngữ** | ✅ |
| Characters | Title + novice copy + **Thêm nhân vật** | ✅ |
| Terms (candidates) | Plain AI suggestion copy | ✅ |

### F. Novice mode (`show_advanced_tools=false`)

| Hidden when OFF | Status |
|-----------------|--------|
| JSON export (Data + Terms) | ✅ |
| Raw term import | ✅ |
| Promote global bulk | ✅ |
| Story State / Recent Context primary UI | ✅ (Phase 3) |
| Workbook import on Chapters | ✅ (overflow, advanced) |
| Metadata tabular on Overview | ✅ (overflow, advanced) |
| Technical sync / provider IDs in primary UI | ✅ (drawers / advanced) |

### G. Visual tokens

| Token | Target | Applied |
|-------|--------|---------|
| Section header | 48–56px | `--section-header-height: 48px` |
| Toolbar | 36–40px | `--toolbar-height: 38px` |
| Button | 30–34px | `--btn-height: 32px`, sm 30px |
| Tabs | 32–36px | `--project-tabs-height: 34px` |
| Card radius | 8–10px | `--radius-md: 8px` |
| Card padding | 16–20px | `--pad-card: 20px` |
| Table row | 44–48px | `--table-cell-y: 0.6875rem` |

### H. Dark theme

| Control | Status |
|---------|--------|
| Input / textarea / select backgrounds | ✅ themed |
| Disabled / readonly | ✅ muted, not white |
| Autofill | ✅ webkit override in `ui.css` |
| Popover / dialog | ✅ existing overlay tokens |

### I. Screenshot test

Manual capture recommended at **1366×768** and **1920×1080** with Advanced Tools OFF and ON:

1. Project Overview  
2. Chapters  
3. AI Memory  
4. Terms  
5. Characters  
6. Data  

Automated screenshot capture not run in CI (Electron desktop app).

## Quality gate

Run locally:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:perf
npm run package
npm run make
```

Known environmental risk: `better-sqlite3` EBUSY on Windows during parallel test runs.

## Residual / follow-up

- **Data JSON export**: copies to clipboard (no file write IPC yet).
- **Domain page export paths**: Terms/Characters still use Save As via tabular IPC; Data hub uses auto path — align in future if desired.
- **Import wizard**: six-step flow retained for external column mapping; preview stats simplified per spec.
