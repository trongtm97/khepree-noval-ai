# Automation Diagnostics (Phase 19)

Developer tools for browser automation health, selector repair, and sanitized exports.

## Route

`/diagnostics` — Developer Diagnostics UI

## Provider status

Each provider exposes:

| Field | Source |
|-------|--------|
| provider version | `PROVIDER_DIAGNOSTICS_META` |
| selector registry version | same |
| last successful run | `app_meta` key `automation.provider.{id}.lastSuccessAt` |

Recorded on Gemini send success and connection-test PASS.

## SELECTOR_NOT_FOUND capture

On miss, diagnostics include:

- screenshot
- current URL
- page title
- sanitized DOM fragment
- operation name
- selector candidates tried

Stored under `cache/automation/…`. HTML/log redaction strips cookies, tokens, password values.

## Selector overrides

File: `{data}/selector-overrides.json`

- Validated Zod schema — **locator data only** (no executable code)
- Modes: `prepend` (default fallback), `append`, `replace`
- Load / reload without app rebuild
- Unsafe CSS (`;`, `` ` ``, `javascript:`) rejected

## Interactive Repair Mode

1. Open headed browser for account profile
2. User clicks target element
3. App records safe locator metadata + suggested strategies
4. Apply → upsert override JSON

**Password fields are never captured.**

## Connection tests

- Test Gemini Connection
- Test Notebook Connection
- Test Drive (OAuth configured + account connected — no tokens)
- Test Browser Profile (`testSession` probe)

## Diagnostics export ZIP

Includes health report, provider status, overrides, recent failure artifacts, redacted logs.

**Never includes:** cookies, OAuth tokens, browser profiles, localStorage/sessionStorage secrets.

## IPC

`diagnostics:*` — see `ipc-channels.ts`

## Tests

`npm test -- tests/unit/diagnostics`
