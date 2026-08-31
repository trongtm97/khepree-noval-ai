# Multi-Provider UX Audit (Phase 6)

**Date:** 2026-08-29  
**Scope:** Provider-aware operational UI — show AI context only when it helps jobs; remove Google-only assumptions.

## Summary

Phase 6 surfaces **user-facing provider names** (Gemini, ChatGPT, Meta AI) in job flows while hiding internal transport IDs. Routing preference `AUTO` does not show a pinned provider in idle translation workspace; provider appears in the **running job strip** only.

## I. Translation workspace

| State | Behavior |
|-------|----------|
| Idle + AUTO | No permanent provider chip in command bar |
| Running | `TranslationJobStrip`: `Đang dịch chương {range} · {provider}` + paragraph progress |
| Fallback | Non-blocking `translation.jobFallbackSwitched` from job progress timeline |

**Files:** `TranslationJobStrip.tsx`, `TranslationCommandBar.tsx`, `job-provider-ui.ts`

## II. Fallback UX

- Brief status line in job strip (no modal)
- Job detail drawer shows attempt chain: `ChatGPT · TIMEOUT ↓ Meta AI · SUCCESS`
- Timeline event: `provider_fallback` (optional backend emit)

**Files:** `JobDetailDrawer.tsx`, `readJobFallbackNotice()`

## III. Jobs page

- **RunningJobCard:** project, chapter range, paragraph progress, `AI: {provider} · {account}`
- **AiAccountSection:** renamed **Tài khoản AI**; all three providers via `useAiAccounts`
- **Queue:** `AI: Tự động` (AUTO) or pinned preference label — no transport IDs

**Files:** `RunningJobCard.tsx`, `AiAccountSection.tsx`, `ProjectQueueSection.tsx`, `useJobsOverview.ts`

## IV. Dashboard

- No three AI status cards
- Connect-AI banner only when **no usable AI channel** (`readiness.aiReady === false`)
- Running jobs section shows provider per card
- Partial provider failure with working fallback: **no prominent dashboard warning**

**Files:** `DashboardPage.tsx`, `RunningJobsSection.tsx`, `useDashboardData.ts`, `dashboard-readiness.ts`

## V. First run / onboarding

| Before | After |
|--------|-------|
| Google account + Gemini required | **Kết nối AI** — Gemini OR ChatGPT OR Meta AI |
| Setup wizard Google-only | Provider picker on connect step; `autoSetupStatus.ready` gates Next |
| Dashboard checklist "Google account" | **Kết nối AI** / **Đã kết nối AI** |

**Files:** `SetupWizardPage.tsx`, `useOnboardingChecklist.tsx`, `DashboardOnboarding.tsx`

## VI. Error copy

| Avoid (generic) | Use |
|-----------------|-----|
| Google account required | **Không có tài khoản AI sẵn sàng** |
| Google-only startup toast | `startupNoAiAccountBody` unless Gemini path specifically blocked |

**Files:** `startup-ai-readiness.ts`, `useStartupAiReadiness.ts`, i18n `notifications.*`

## VII. Provider icons

Text labels only (Gemini, ChatGPT, Meta AI) — consistent with accounts center; no logo dependency.

**Helper:** `@shared/utils/ai-preference-label` → `userFacingProviderLabel()`

## VIII. Test matrix

| Install | Expected |
|---------|----------|
| ChatGPT only | Dashboard ready, translate works, Jobs shows ChatGPT, no "Google chưa kết nối" |
| Meta only | Same pattern |
| Gemini only | Same pattern (Google path when Gemini selected) |

**Tests:** `startup-ai-readiness.test.ts`, `job-provider-ui.test.ts`

## IX. Gaps / follow-ups

1. **Backend:** emit `provider_fallback` timeline entries from `ai-provider-manager` when fallback occurs (UI reads if present).
2. **Job attempts:** ensure `providerType` populated on `JobAttemptDto` for full chain display.
3. **CSS:** optional polish for `.dashboard-connect-ai`, `.jobs-attempt-chain`.

## Quality gate

- [x] Operational UI provider-aware
- [x] Google not required for ChatGPT/Meta-only installs (startup gate)
- [x] i18n vi/en keys for new copy
- [x] Unit tests for startup + job-provider UI helpers
- [x] This audit document
