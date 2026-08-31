# Khepree Cross-System Acceptance — Phase N09

Acceptance matrix for **Khepree Novel AI ↔ Khepree** commercial integration.  
Automated proofs run with `KHEPREE_DEV_MOCK=1` in CI. Staging/live rows require operator authorization.

## Verdict labels

| Label | Meaning |
|-------|---------|
| **MOCK PASS** | Automated integration/unit test passed (`tests/integration/khepree-cross-system-acceptance.test.ts`) |
| **STAGING PASS** | Verified against Khepree staging API + account.khepree.com (manual) |
| **NOT RUN** | Not executed — do not claim production-ready |
| **N/A** | Out of scope (e.g. production payment without authorization) |

## E2E matrix

| # | Scenario | Mock | Staging | Pass criteria |
|---|----------|------|---------|---------------|
| 1 | Language VI/EN persist | **MOCK PASS** | NOT RUN | First-run chooser writes `app_meta`; reopen preserves preference |
| 2 | First login OAuth | **MOCK PASS** | NOT RUN | System browser opens; callback creates session; no password in app state/logs |
| 3 | No entitlement | **MOCK PASS** | NOT RUN | Signed in → `ENTITLEMENT_MISSING` → purchase UI |
| 4 | Entitled user | **MOCK PASS** | NOT RUN | Login → activation → lease verified → `ACTIVE` workspace |
| 5 | Persistent login | **MOCK PASS** | NOT RUN | Reopen → `VALIDATING_SESSION` → `ACTIVE`; no login gate |
| 6 | Cold start offline | **MOCK PASS** | NOT RUN | Network fail → `OFFLINE_COLD_START`; no cached lease bypass |
| 7 | Device limit | **MOCK PASS** | NOT RUN | `DEVICE_LIMIT_REACHED`; X/Y shown; Manage Devices link |
| 8 | Remove device → retry | **MOCK PASS** | NOT RUN | After removal, Retry Activation → `ACTIVE` |
| 9 | Old device revoked | **MOCK PASS** | NOT RUN | Revoked device cold start → no protected access |
| 10 | Device block | **MOCK PASS** | NOT RUN | Block → refresh denied; retry blocked |
| 11 | Entitlement suspension | **MOCK PASS** | NOT RUN | Heartbeat → suspended; new protected work blocked |
| 12 | Token theft simulation | **MOCK PASS** | NOT RUN | Stolen blob / missing private key → no silent activation |
| 13 | Replay | **MOCK PASS** (OAuth) | NOT RUN | OAuth callback replay rejected; device nonce replay verified server-side in staging |
| 14 | Upgrade | **MOCK PASS** | NOT RUN | Checkout poll → `ACCESS_ACTIVE` → features without restart |
| 15 | Payment redirect spoof | **MOCK PASS** | NOT RUN | Browser return alone does not upgrade; API must confirm |
| 16 | Sign-out vs deactivate | **MOCK PASS** | NOT RUN | Sign out clears session; device id until server removal |
| 17 | Job revoke safety | **MOCK PASS** | NOT RUN | Jobs paused at boundary; DB rows intact |

## Automated test entry point

```bash
npm run test:integration -- tests/integration/khepree-cross-system-acceptance.test.ts
```

Supporting unit suites: `tests/unit/khepree/*`, `tests/unit/i18n/ui-language-service.test.ts`, `tests/unit/security/*`.

## Staging opt-in (manual)

Set dev overrides (never in packaged build):

```powershell
$env:KHEPREE_API_BASE = "https://staging-api.khepree.com"
$env:KHEPREE_DEV_MOCK = "0"
```

Run through USER_GUIDE flows on a Windows test machine. Do **not** run production checkout unless billing is authorized.

## Quality gate (N09)

| Gate | N09 result |
|------|------------|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **FAIL** (613 pre-existing repo-wide ESLint violations; N09 file clean with test eslint pragmas) |
| `npm test` | **PASS** (1585 passed, 2 skipped) |
| `npm run test:integration` | **PASS** (71 passed, incl. 20 N09 scenarios) |
| `npm run package` | **PASS** |
| `npm run make` | **PASS** |

## User flows (documentation cross-ref)

### First installation

1. Install Khepree Novel AI  
2. Choose language (VI or EN)  
3. **Khepree → Sign in** (system browser)  
4. Activate device / entitlement  
5. Use workspace  

See [USER_GUIDE.md](./USER_GUIDE.md#khepree-commercial-access).

### New computer

1. [account.khepree.com](https://account.khepree.com) → Devices  
2. Remove old device  
3. Install / open Khepree Novel AI on new PC → Sign in  
4. **Retry Activation**  

### Upgrade

1. Khepree → Plan → Upgrade  
2. Browser checkout  
3. Return to app (polling detects entitlement)  
4. Features update without restart  

## Remaining external production blockers

| Blocker | Status |
|---------|--------|
| Production lease signing key (`KHEPREE_TRUSTED_SIGNING_KEYS.k1`) | Empty — must ship pinned key before prod |
| Staging cross-system manual matrix | NOT RUN |
| Live Google/ChatGPT/Meta browser smoke | NOT RUN (separate from Khepree) |
| Production payment / webhook entitlement | N/A without authorization |

## Implementation-complete criteria

Khepree commercial integration is **implementation-complete** when:

- All matrix rows are **MOCK PASS** or documented **STAGING PASS**
- Quality gates PASS
- Documentation updated (README, ARCHITECTURE, USER_GUIDE, TROUBLESHOOTING, RELEASE_CHECKLIST, PROJECT_STATE, CHANGELOG)
- No secrets committed; final commit pushed
