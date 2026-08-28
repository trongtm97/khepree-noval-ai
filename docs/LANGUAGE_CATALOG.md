# World Language Catalog

NovelTrans Studio uses a **World Language Catalog** — an extensible registry of BCP-47 / ISO 639-1 language profiles used for project pairs, prompts, text adapters, and UI pickers.

## Important disclaimer

**Language presence in the catalog ≠ guaranteed identical translation quality.**

Every language can be selected, but NovelTrans does not claim equal output quality across all pairs. Support tiers describe *workflow verification*, not literary quality.

## Profile fields

Each `LanguageProfile` includes:

| Field | Description |
|-------|-------------|
| `code` | Canonical BCP-47 / ISO code (`en`, `zh-Hans`, `pt-BR`, `sr-Latn`, …) |
| `internationalName` | English-style international label (`Japanese`, `Chinese (Simplified)`) |
| `nativeName` | Endonym (`日本語`, `简体中文`) |
| `displayNameVi` | Vietnamese UI localization (`Tiếng Nhật`) |
| `script` | BCP-47 script subtag (open string: `Latn`, `Deva`, `Arab`, …) |
| `direction` | `ltr` or `rtl` — drives editor `dir` attribute |
| `regionGroup` | Browse group in language picker |
| `aiSupportTier` | AI workflow tier (see below) |
| `segmentationStrategy` | Text adapter hint (`cjk_char`, `whitespace`, `thai`, `mixed`) |
| `quoteStyle` / `punctuationProfile` | Typographic defaults |
| `supportsTransliteration` | Whether romanization helpers apply |

### UI display format

```
English — English · en
Japanese — 日本語 · ja
Arabic — العربية · ar
Chinese (Simplified) — 简体中文 · zh-Hans
```

## AI support tiers

| Tier | Meaning |
|------|---------|
| `GEMINI_WEB_VERIFIED` | Listed in Google Gemini Web official language set; used in NovelTrans browser workflow |
| `GEMINI_EXTENDED` | Broader Gemini/API capability; selectable but not browser-verified in NovelTrans |
| `EXPERIMENTAL` | ISO catalog entry; quality not proven in NovelTrans |

Do **not** present `EXPERIMENTAL` or `GEMINI_EXTENDED` languages as "fully supported" in user-facing copy.

## Region groups

Picker sections (approximate, for discoverability):

- `POPULAR` — common translation pairs
- `EAST_ASIA`, `SOUTHEAST_ASIA`, `SOUTH_ASIA`, `CENTRAL_ASIA`
- `MIDDLE_EAST`, `EUROPE`, `AFRICA`, `AMERICAS`, `OCEANIA`, `OTHER`

## Source auto-detect

- `AUTO` is allowed **only for source language** at project creation.
- Target language must always be explicit.
- User hint is **never** the detected language; mismatch is reported, content wins.

### Script detection vs language detection

Local analysis splits two questions:

1. **Script** — Unicode writing system (`Cyrl`, `Arab`, `Latn`, `Hebr`, `Thai`, `Kore`, `Jpan`, …). Script may be high-confidence.
2. **Language** — catalog BCP-47 code (`ru` vs `uk`, `ar` vs `fa`, `en` vs `it`). High local confidence is allowed **only** when evidence identifies a language, not merely a script.

Script-only hits on ambiguous families **must** call AI (when an AI detector is provided). Local must not lock Russian/Arabic/English from script alone.

| Script | Ambiguous languages (examples) | High local confidence |
|--------|--------------------------------|------------------------|
| `Cyrl` | ru, uk, bg, sr, mk, be, kk, ky, … | Only with language-specific letters/words (ї/є, ә/қ, ъ + Bulgarian markers, …) |
| `Arab` | ar, fa, ur, ps, sd, ug, ckb, … | Only with language-specific letters (پ/چ/گ, ٹ/ے, …) |
| `Latn` | en, fr, es, pt, de, it, nl, ro, id, ms, … | Only with distinctive function words / letters (not “Latin → English”) |
| `Hebr` | he, yi | Yiddish letters װ/ױ/ײ can identify `yi`; otherwise AI |
| `Jpan` | ja | Kana (+ Han) may identify Japanese |
| `Kore` | ko | Hangul strongly identifies Korean |
| `Thai` | th | Thai script may be high-confidence `th` |

Chinese Han without kana/hangul identifies the Chinese family (`zh-Hans` / `zh-Hant` via simplified vs traditional hits).

### Pipeline

1. Script detection (Unicode).
2. Language-specific lexical evidence (distinctive letters + function words).
3. If language is identified with high confidence → use local result (no AI).
4. If only script is known, or confidence is below high → **AI fallback**.
5. AI `language_code` must exist in the World Language Catalog (`LanguageProfile` registry). Unknown codes are discarded; local fallback remains.
6. AI prompt allow-list is generated from `WORLD_LANGUAGE_CATALOG` / `listLanguageCatalogCodes()` — not a hardcoded 15-language subset.

User can always override the detected source.

## Recent language pairs

Recent source→target pairs are stored in browser `localStorage` (`noveltrans.recentLanguagePairs`) for quick project setup. Max 8 entries.

**Recent pairs do not override** the global `default_target_language` setting when creating projects or editions.

## Default target language (`default_target_language`)

Global user setting stored in `app_meta` (`settings.default_target_language`).

| Behavior | Detail |
|----------|--------|
| Used when | New project wizard (target pre-fill), new translation edition (+ Add) |
| Not used when | Existing projects, existing editions, notebook/term vault of old editions |
| Migration fallback | `vi` when unset (legacy zh→vi installs) |
| Validation | Must exist in Language Catalog; invalid persisted values fall back with Settings warning |
| EXPERIMENTAL tier | Allowed; Settings shows Gemini verification warning |

Configure: **Cài đặt → Dịch thuật → Ngôn ngữ dịch mặc định**.

Onboarding step `defaultLanguage` lets users set this on first run; skip keeps migration fallback.

Priority when creating: (1) explicit wizard/edition picker choice, (2) `default_target_language`, (3) migration fallback `vi` only if setting missing.

## Extending the catalog

```typescript
import { registerLanguageProfile } from '@shared/constants/language-profile';

registerLanguageProfile({
  code: 'xx',
  internationalName: '…',
  nativeName: '…',
  displayNameVi: '…',
  displayNameNative: '…',
  script: 'Latn',
  direction: 'ltr',
  regionGroup: 'OTHER',
  aiSupportTier: 'EXPERIMENTAL',
  segmentationStrategy: 'mixed',
  quoteStyle: 'ascii',
  punctuationProfile: 'western',
  supportsTransliteration: false,
});
```

Catalog seeds live in `src/shared/constants/world-language-catalog.ts`.

## Related files

- `src/shared/constants/language-profile.ts` — registry API
- `src/shared/constants/world-language-catalog.ts` — catalog data
- `src/shared/constants/language-catalog-search.ts` — search / grouping
- `src/main/language/script-detect.ts` — Unicode script vs catalog uniqueness
- `src/main/language/language-lexical.ts` — language-specific letters/words
- `src/main/language/language-detect.ts` — orchestrates script + lexical + AI gate
- `src/main/language/ai-language-detect.ts` — catalog allow-list prompt + parse
- `src/renderer/components/LanguagePicker.tsx` — searchable combobox UI
- `tests/unit/language/language-catalog.test.ts` — registry invariants
- `tests/unit/language/script-vs-language-detection.test.ts` — script ≠ language + AI mocks
