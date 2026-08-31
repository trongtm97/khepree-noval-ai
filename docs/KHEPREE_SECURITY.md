# Khepree Client Security Foundation

Main-process security boundary for commercial licensing. Renderer never receives tokens, private keys, or raw lease signatures.

## Module layout (`src/main/khepree/`)

| Module | Role |
|--------|------|
| `config.ts` | Pinned production URLs; dev-only env overrides |
| `khepree-api-client.ts` | HTTP + dev mock; Zod-validates every success response |
| `device-identity-service.ts` | Installation UUID + Ed25519 keypair (private key encrypted) |
| `session-store.ts` | Refresh token encrypted; access token memory-only |
| `lease-verifier.ts` | Schema + Ed25519 + expiry + installation/device/product binding |
| `khepree-access-service.ts` | Orchestration; sanitized public state only |
| `errors.ts` | Typed errors including `CREDENTIAL_CORRUPT`, `SAFE_STORAGE_UNAVAILABLE` |

Shared API schemas: `src/shared/schemas/khepree-api.ts`

## Config

Production endpoints are pinned in `KHEPREE_ENDPOINTS`. When `app.isPackaged`, env cannot override API base URL or product ID.

Dev-only overrides: `KHEPREE_API_BASE`, `KHEPREE_PRODUCT_ID`, `KHEPREE_DEV_MOCK`.

## Credentials

- **Installation ID:** `randomUUID()` in `app_meta` — not hardware fingerprint.
- **Device private key:** PKCS8 DER encrypted via `safeStorage`; corrupt state → `CREDENTIAL_CORRUPT` (no silent re-generation).
- **Refresh token:** encrypted in secrets DB; corrupt decrypt → `CREDENTIAL_CORRUPT`.
- **Access token:** in-memory only; never persisted plaintext.

## Lease verification

Every lease loaded from API must pass:

1. Zod schema (`parseSignedLease`) — includes `entitlementId`, `iat`, `expiresAt`, features
2. Ed25519 signature (pinned or dev key)
3. `iat` not in future (5 min skew); expiry / grace window
4. Binding to local `installationId`, `deviceId`, `productId`

Invalid lease → fail closed (lease cleared, status `ERROR` or entitlement gate).

## Access state machine (Phase N04)

Authoritative states in `KHEPREE_ACCESS_STATES` — renderer receives `status` only (no ad-hoc booleans).

Cold start (saved session):

1. `VALIDATING_SESSION` → refresh token → device activation if needed → `/session/cold-start`
2. Verify signed lease (signature, key, product, device, entitlement, `iat`, `exp`, features)
3. Only `ACTIVE` unlocks workspace and protected IPC

Network failure during cold start → `OFFLINE_COLD_START` (lease cleared — no cached bypass).

Protected IPC calls `assertProductAccess()` via `product-access-boundary` (fail-closed when packaged).

Device limit UI: manage devices URL, retry activation (no re-login), sign out.

## Heartbeat + runtime revocation (Phase N05)

- **Owner:** main-process `KhepreeHeartbeatService` — no renderer timers.
- **Start/stop:** only when access `status === ACTIVE`; stops on logout/shutdown.
- **Interval:** from signed lease `heartbeatIntervalMs`, else `KHEPREE_DEFAULT_HEARTBEAT_MS`.
- **Device proof:** each heartbeat POST includes `timestamp`, `nonce`, canonical JSON, Ed25519 signature (main-only private key).
- **Server responses:** map to access states; `SESSION_REVOKED` clears session → `AUTH_REQUIRED`; device removed clears local `deviceId`.
- **Network transient:** stay `ACTIVE` while lease/grace valid; if lease expired → `OFFLINE_COLD_START` (no infinite offline mode).
- **Running jobs:** `lockProtectedJobsOnKhepreeRevocation` pauses scheduler + queued jobs (`PAUSED`, reason `khepree:*`); in-flight batches finish at safe boundary.
- **Windows resume:** `powerMonitor` resume/unlock triggers immediate heartbeat (debounced).

## Account & About UX (Phase N06)

- Sidebar **Khepree** → hub with Account, Plan, Devices, About sub-pages.
- Renderer opens named targets only (`openExternal({ target })`) — main resolves pinned URLs.
- Sign out: best-effort server `/auth/logout`, then clear encrypted refresh token (device activation unchanged).
- Device removal: always via account.khepree.com (no unsafe remote remove from desktop).

## OAuth browser login (Phase N03)

- **Protocol:** `khepree-novel-ai://auth/callback` (registered as "Khepree Novel AI" in Windows installer)
- **PKCE:** S256 challenge/verifier generated in main process only
- **Callback:** validated in `OAuthAuthTransactionManager` — scheme, path, state, expiry, replay protection
- **Exchange:** `POST /auth/device/exchange` with code, verifier, clientId, redirectUri, device binding
- **Persistence:** refresh token encrypted in secrets DB; access token memory-only
- **Reopen:** saved session → `validating` gate → cold-start (no login screen first)
- **Single instance:** `requestSingleInstanceLock` + `second-instance` forwards deep links

Renderer calls `startLogin()` IPC only — never receives verifier, code, or tokens.

## Tests

`tests/unit/khepree/` — device identity, session store, API schemas, lease verifier, config, renderer surface.
