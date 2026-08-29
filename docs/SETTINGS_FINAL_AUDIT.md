# Settings UX — Final Audit (Phase 6)

Date: 2026-08-29

## Tab IA

| Legacy tab | New tab |
|------------|---------|
| appearance | general |
| export | storage |
| aiProviders | ai |
| aiDiagnostics | advanced |
| googleAi | ai |
| (7 tabs) | **6 tabs**: general · language · translation · ai · storage · advanced |

## Novice workflow

| Area | Normal UX |
|------|-----------|
| General | Theme, density, recommended settings |
| Language | UI locale, default target language, source AUTO |
| Translation | AUTO-first concurrency; editor prefs |
| AI | Status + **Kiểm tra & sửa tự động** + link Accounts |
| Storage | Export path, auto backup ON, backup now, app data |
| Advanced | *(hidden technical controls only)* |

## One-click automation

| Action | Location |
|--------|----------|
| AI health & auto-fix | AI tab → `AiAutoSetupService` |
| Storage health | Storage tab → `checkStorageHealth` |
| Full system check | Advanced → Chẩn đoán → `runSystemHealth` |
| AI browser full probe | Advanced → Chạy kiểm tra đầy đủ |

## Advanced sections (Phase 6)

1. **Giao diện nâng cao** — showAdvancedTools, showParagraphIds
2. **AI nâng cao** — providers (disclosure), manual Web API connect (disclosure)
3. **Xử lý song song nâng cao** — per-project/per-provider limits, parallel waves
4. **Chẩn đoán** — system health + AI probes (details disclosure)
5. **Nhật ký** — open logs (+ full diagnostics page in details)
6. **Cập nhật** — current version + check (technical body in details)
7. **Dữ liệu / bảo trì** — learning, novel export page

## Stale Drive cleanup

**Removed from production i18n:**
- `settings.googleAi`, entire `settings.oauth*` block, `settings.openExport`
- `accounts.connectDrive`, `disconnectDrive`, `driveOAuth*`

**Updated copy:**
- README product description (local-first, optional Research Notebook)
- `sourceFolder.optAutoTranslateHint`
- `diagnostics.notebookGroundingBody` (no Drive worker requirement)
- AI diagnostics body (notebook optional)

**Deleted:**
- `SchedulerConcurrencyPanel.tsx` (superseded)

**Guard test:**
- `tests/unit/i18n/stale-architecture-strings.test.ts`

## Quality gates

Run before release:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:perf
npm run package
npm run make
```
