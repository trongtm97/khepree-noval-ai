# Desktop integration guide

Integrate **Khepree Novel AI** with account-based auth, device activation, and Khepree-hosted checkout.

Production identity (Product Studio):

| Parameter | Value |
|-----------|-------|
| OAuth client ID | `khepree.novel-ai.desktop` |
| Redirect URI | `khepreenovelai://auth/callback` |
| URL scheme | `khepreenovelai` |
| Product code | `KHEPREE_NOVEL_AI` |
| Product slug | `khepree-novel-ai` |
| Access feature | `novel_ai.access` |
| API base | `https://api.khepree.com/api/v1` |

See also the canonical guide in the KHEPREE monorepo: `docs/DESKTOP-INTEGRATION.md`.

## Flow

1. Browser PKCE login → `https://account.khepree.com/desktop/authorize`
2. Token exchange → `POST /api/v1/desktop/auth/exchange`
3. Activate device → `POST /api/v1/desktop/activate`
4. Refresh / heartbeat with Ed25519 device proof
5. Checkout → `POST /api/v1/desktop/checkout` → open `handoffUrl`
6. Poll → `GET /api/v1/desktop/checkout/{id}/status` until `ACCESS_ACTIVE`
7. Plans catalog → `GET /api/v1/desktop/plans?clientId=...`

Entitlement is granted via feature `novel_ai.access` — never branch on plan display names.

## Build requirements

Set `KHEPREE_LICENSE_SIGNING_PUBLIC_KEY` (SPKI base64 from production VPS) before shipping packaged builds, or pin `KHEPREE_TRUSTED_SIGNING_KEYS` in `src/main/khepree/config.ts`.

Verify: `npm run check:khepree-signing`

## Dev overrides (unpackaged only)

```powershell
$env:KHEPREE_API_BASE = "http://localhost:3004/api/v1"
$env:KHEPREE_ACCOUNT_BASE = "http://localhost:3001"
$env:KHEPREE_DEV_MOCK = "0"
```

Mock CI: `KHEPREE_DEV_MOCK=1`
