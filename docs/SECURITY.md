# NovelTrans Studio — Security

> Local security model for desktop Windows build. Secrets never leave the machine as plaintext in the database.

## 1. Goals

- Protect OAuth refresh/access tokens and other sensitive app tokens at rest
- Never store Google account passwords
- Never silently fall back to plaintext if OS encryption is unavailable
- Keep renderer unprivileged: no arbitrary FS, shell, or SQL
- Audit security-relevant user/system actions without logging secrets

## 2. Electron Hardening

| Control | Setting |
|---------|---------|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| `webSecurity` | `true` |
| Preload API | Whitelist only (`ALLOWED_IPC_CHANNELS`) |
| CSP | `default-src 'self'` (see `index.html`) |
| Navigation | `will-navigate` blocked except app origin / file |
| Window open | Denied; allowed `https`/`mailto` via `shell.openExternal` (no `http:`) |
| Webview | `will-attach-webview` prevented |
| Remote content | Not loaded with Node privileges |
| Code signing | Env-only (`WINDOWS_CERTIFICATE_*`) — never commit certs |

## 3. SecretStorageService

Location: `src/main/security/`

### API

| Method | Behavior |
|--------|----------|
| `encrypt(plainText)` | Encrypt via Electron `safeStorage` → `Buffer` ciphertext |
| `decrypt(ciphertext)` | Decrypt ciphertext → plaintext string |
| `replace({ secretKey, plainText, kind, ... })` | Encrypt + upsert into `secrets` table |
| `delete(secretKey)` | Remove secret row |
| `healthCheck()` | Report availability / backend / mode |

### Encryption backend

Electron **33** ships synchronous `safeStorage` (`encryptString` / `decryptString`).  
`SecretStorageService` exposes an **async** API and:

1. Prefers `encryptStringAsync` / `decryptStringAsync` / `isAsyncEncryptionAvailable` when present (future Electron)
2. Otherwise wraps sync APIs as Promises (`mode: sync-wrapped`)
3. **Never** stores plaintext if encryption is unavailable — throws `SafeStorageUnavailableError`

### What may be stored

| Allowed | Forbidden |
|---------|-----------|
| OAuth refresh token | Google password |
| OAuth access token (short-lived, if persisted) | Cookie **plaintext** in DB |
| Other app API tokens | Raw Gemini response as a “secret” |
| Gemini Web API session cookies (`SecretKind: gemini_web_session`) — **ciphertext only** via safeStorage | Logging cookies / PSID / tokens |

Gemini Web API cookies are accepted once over IPC for encrypt + worker `session/init`, then only ciphertext remains in `secrets`. The Python worker may persist auto-refreshed cookies under the per-account session directory on disk (not in SQLite, never in logs).

### Database storage

Table `secrets` stores **only** `encrypted_blob` (BLOB) plus metadata (`secret_key`, `kind`, `owner_type`, `owner_id`).  
`google_oauth_credentials.encrypted_blob` remains available for account-scoped OAuth rows; prefer `secrets` for new credential storage via `SecretStorageService.replace`.

## 4. IPC Permission Model

### Renderer must not

- Pass arbitrary filesystem paths
- Run arbitrary shell commands
- Execute arbitrary SQL / open DB handles
- Read/decrypt secrets

### Current channels (audited in `src/main/security/ipc-audit.ts`)

| Channel | Shell | FS path input | DB | Secrets |
|---------|-------|---------------|----|---------|
| `app:ping` | no | no | no | no |
| `app:get-version` | no | no | no | no |
| `app:getInfo` | no | no | no | no |
| `app:getPaths` | no | no | no | no |
| `app:openFolder` | yes\* | enum `pathKey` only | no | no |
| `security:healthCheck` | no | no | no | no† |

\* `shell.openPath` only for managed NovelTrans directories under `%APPDATA%/NovelTrans/`.  
† Returns availability flags only — never ciphertext or tokens.

Every handler validates request (and response where applicable) with **Zod**. Invalid payloads → `IpcValidationError`.

`assertIpcAuditComplete()` runs at handler registration — new channels without an audit entry fail startup.

## 5. Audit Log

Table `audit_events`. Events:

| Event | When |
|-------|------|
| `account_added` | Google account registered |
| `account_removed` | Google account removed |
| `project_deleted` | Project soft/hard deleted |
| `credentials_changed` | Secret replace/delete via SecretStorage |
| `translation_started` | Translation job starts |
| `export` | Novel export performed |

### Must not log

- Cookies
- OAuth tokens / ciphertext
- Raw Gemini responses when `security.diagnostic_content_logging` is `false` (default)

Metadata is sanitized via `sanitizeAuditMetadata` (keys containing `token`, `cookie`, `password`, `secret`, etc. → `[REDACTED]`).

## 6. Diagnostic Content Logging

App meta key: `security.diagnostic_content_logging` (default `false`).

When `false`, `AuditLogService.logDiagnosticContent` is a no-op — raw AI payloads stay out of logs.

## 7. Threat Notes

| Risk | Mitigation |
|------|------------|
| DB stolen offline | Ciphertext only; OS DPAPI/Keychain required to decrypt |
| safeStorage unavailable | Explicit error — refuse to store secrets |
| Malicious renderer | Sandbox + whitelist + Zod; no secret IPC |
| Log leakage | Redaction + diagnostic content flag |
| Path traversal via openFolder | Enum `pathKey` + `isManagedPath` check |

## 8. Testing

- `tests/unit/security/secret-storage.test.ts` — encrypt/decrypt, replace/delete, unavailable backend, bad input
- `tests/unit/security/ipc-validation.test.ts` — Zod rejection, audit coverage, no dangerous permissions

## 9. Operational Checklist

1. Call `initializeSecurityServices()` after DB open (done in `main.ts`)
2. Use `getSecretStorage().replace(...)` for credentials — then `getAuditLog().credentialsChanged(...)`
3. Never expose decrypt results over IPC
4. Before shipping a new IPC channel: add Zod schemas, whitelist entry, and `IPC_CHANNEL_AUDIT` row

## 10. Commercial licensing (Khepree) — see also `docs/KHEPREE_SECURITY.md`

Khepree Novel AI adds a main-process licensing boundary above translation/export IPC. Renderer receives sanitized state only.

**Distribution notice:** Electron desktop clients cannot be made “uncrackable.” Public source exposure lowers the cost of patching licensing checks. Before commercial release, evaluate repository privacy, binary-only distribution, code signing, and update channel policy — this project does **not** change GitHub repository visibility automatically.

## 11. Electron Forge fuses (packaged builds)

Configured in `forge.config.ts` via `@electron-forge/plugin-fuses`:

| Fuse | Value | Purpose |
|------|-------|---------|
| `RunAsNode` | `false` | Prevent `ELECTRON_RUN_AS_NODE` abuse |
| `EnableCookieEncryption` | `true` | Encrypt Chromium cookies |
| `EnableNodeOptionsEnvironmentVariable` | `false` | Block `NODE_OPTIONS` injection |
| `EnableNodeCliInspectArguments` | `false` | Block `--inspect` on packaged app |
| `EnableEmbeddedAsarIntegrityValidation` | `true` | Validate ASAR integrity |
| `OnlyLoadAppFromAsar` | `true` | Load application code from ASAR only |

Packaging tests: `tests/unit/khepree/security-audit.test.ts` (fuse assertions).
