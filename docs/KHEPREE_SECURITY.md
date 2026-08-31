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

Every lease loaded from API or cache must pass:

1. Zod schema (`parseSignedLease`)
2. Ed25519 signature (pinned or dev key)
3. Expiry / grace window
4. Binding to local `installationId`, `deviceId`, `productId`

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
