# Language Support Audit — 2026-08-29

## Sources

| Source | URL | Date |
|--------|-----|------|
| Gemini Web supported languages | https://support.google.com/gemini/answer/13575153 | 2026-08-29 |
| NovelTrans catalog | `src/shared/constants/world-language-catalog.ts` | 2026-08-29 |
| Official fixture | `src/shared/constants/gemini-web-official-2026.ts` | 2026-08-29 |

## Summary

| Metric | Count |
|--------|------:|
| Catalog total (canonical codes) | 129 |
| Gemini Web official (`GEMINI_WEB_OFFICIAL`) | 78 |
| NovelTrans workflow verified (`VERIFIED`) | 43 |
| Gemini API extended (`GEMINI_API_EXTENDED`) | ~40 |
| Catalog-only / experimental | remainder |

## Bug fixed

`GEMINI_WEB_VERIFIED_CODES` previously listed only **43** languages as “Web verified”, conflating **Google UI availability** with **NovelTrans QA**. Many officially supported Gemini Web languages (e.g. `af`, `fa`, `fil`, `ta`, `mr`, `zu`) were incorrectly tiered as `GEMINI_EXTENDED`.

### Resolution

Two dimensions:

- **`providerSupport`**: `GEMINI_WEB_OFFICIAL` | `GEMINI_API_EXTENDED` | `CATALOG_ONLY`
- **`novelTransVerification`**: `VERIFIED` | `UNTESTED` | `KNOWN_ISSUE`

All **78** official Gemini Web languages now map to `GEMINI_WEB_OFFICIAL`. Only the 43 browser-workflow-tested pairs remain `VERIFIED`.

## Missing official languages (before → after)

All languages from Google’s official table are now in `GEMINI_WEB_OFFICIAL_CODES`, including:

`af`, `sq`, `am`, `hy`, `as`, `az`, `eu`, `be`, `bs`, `ca`, `fa`, `fil`, `gl`, `ka`, `gu`, `is`, `kn`, `kk`, `km`, `lo`, `mk`, `ms`, `ml`, `mr`, `mn`, `ne`, `or`, `pa`, `ta`, `te`, `ur`, `uz`, `zu`, `zh-HK`, …

**Missing official after audit: 0**

## Duplicate / legacy codes

| Issue | Fix |
|-------|-----|
| `jw` duplicate Javanese row | Removed from catalog; alias `jw → jv` |
| `tl` used as Filipino | Canonical `fil` for Filipino; `tl` = Tagalog |
| `iw`, `in` legacy ISO | Aliases → `he`, `id` |
| `zh-HK` mapped to `zh-Hant` | Now canonical `zh-HK` entry |

## Migration

`040-language-code-normalization`:

- Persisted `jw` → `jv`
- Legacy persisted `tl` (Filipino) → `fil`
- Tables: projects, terms, translation_editions, term_translations, default_target_language setting

Non-destructive `UPDATE`; DB backup via migration runner.

## Aliases

- **Persistence**: `LANGUAGE_CODE_ALIASES` (`language-code-aliases.ts`)
- **Search**: `LANGUAGE_SEARCH_ALIASES` (e.g. farsi→fa, jw→jv, filipino→fil)
- **Legacy map**: `LEGACY_LANGUAGE_CODE_MAP` (BCP-47 variants)

Aliases never create new catalog rows.

## Tests added/updated

- `tests/unit/language/language-catalog.test.ts` — official Web ⊆ catalog, verification split, aliases, core pairs
- Tier regression: every `GEMINI_WEB_OFFICIAL_CODES` → `providerSupport === GEMINI_WEB_OFFICIAL`

## UI

- Picker default: stacked `International` / `Native · code`
- Subtle `✓` / `○` verification indicator (not “Gemini dịch hoàn hảo”)
- Tooltip: *Gemini hỗ trợ ngôn ngữ này. NovelTrans chưa kiểm thử đầy đủ quy trình dịch.*

## Known limitations

- Hong Kong Chinese (`zh-HK`) listed by Google; detection still prefers `zh-Hant` without HK-specific evidence.
- Tagalog (`tl`) vs Filipino (`fil`) are distinct; legacy DB rows using `tl` as Filipino migrated to `fil`.
- Provider matrix extensible via `LanguageProviderSupport`; static data for now.
- Language smoke test diagnostic: not implemented (future developer tool).

## Wording policy

UI uses **“Ngôn ngữ có thể sử dụng”** — not a quality guarantee.
