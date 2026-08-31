# Simple AI Routing Settings (Phase 5)

User-facing **AiPreference** layer — separate from internal provider transport IDs.

## AiPreference (user intent)

| Value | Label (VI) |
|-------|------------|
| `AUTO` | Tự động — Khuyên dùng |
| `GEMINI` | Gemini |
| `CHATGPT` | ChatGPT |
| `META_AI` | Meta AI |

Stored in `app_meta`: `ai.routing.preference`

Internal IDs (`PLAYWRIGHT_GEMINI`, `GEMINI_WEB_API`, etc.) remain in Advanced → AI Providers.

## AUTO routing

When `AUTO`, resolver picks first ready group in order: Gemini → ChatGPT → Meta AI, using:

- provider `READY` status
- account availability per group
- existing DB priority inside Gemini (Web API before Browser)

Tests: `tests/unit/ai/ai-preference-policy.test.ts`

## Settings UI (normal)

Single AI section:

1. Auto-setup status + **Kiểm tra & tự sửa**
2. **Phương thức dịch** radio (`AiPreferencePanel`)
3. Provider health rows (Gemini / ChatGPT / Meta ✓)
4. Fallback toggle — *Tự động chuyển sang AI khác khi gặp lỗi*
5. **Kiểm tra tất cả** + **Quản lý tài khoản AI**

Removed from normal settings:

- `PrimaryTranslationProviderPanel` (4 transport IDs)
- `ProjectPrimaryProviderPanel` (global settings)
- `PreferNotebookPackToggle` → Advanced → Legacy / Experimental

## Project override

**Translation workspace** → ⋯ → **AI cho dự án này…**

`ProjectAiPreferenceDialog` — global default + AUTO/Gemini/ChatGPT/Meta.

Stored in `project_settings.style_config.aiPreference`.

## Auto setup (provider-neutral)

- Checks all translation providers + browser AI accounts
- Login prompts use `loginTarget`: GEMINI | CHATGPT | META_AI
- UI: *Cần đăng nhập tài khoản AI* + targeted *Đăng nhập {provider}*

## Translation toolbar

During active job: subtle chip (`Gemini` / `ChatGPT` / `Meta AI`) → Jobs page.

No permanent provider selector when AUTO.

## Advanced

`AiProvidersSettingsPanel` — exact provider IDs, priority, PIN mode, transport.

## Quality gate

Normal UI must not require understanding: PLAYWRIGHT, WebAPI, pack mode, Notebook transport.

## Key files

- `src/shared/constants/ai-preference.ts`
- `src/main/ai/ai-preference-policy.ts`
- `src/renderer/components/settings/AiPreferencePanel.tsx`
- `src/renderer/components/settings/AiSettingsPanel.tsx`
- `src/renderer/components/settings/ProjectAiPreferenceDialog.tsx`
- `src/shared/utils/ai-preference-label.ts`
