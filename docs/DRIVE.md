# Google Drive Integration (Phase 10)

Official Google Drive API with Desktop OAuth and `drive.file` scope (least privilege).

## OAuth

| Item | Value |
|------|--------|
| Client type | Desktop app |
| Scope | `https://www.googleapis.com/auth/drive.file` |
| Flow | Loopback `http://127.0.0.1:<port>/oauth2callback` |
| Per worker | Separate encrypted refresh token |

Configure client:

1. Settings → Google Drive OAuth → Client ID (+ optional secret), or
2. Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

**OAuth client type must be Desktop app** (not Web). Redirect URI used by the app:

`http://127.0.0.1:18766`

(no path). Desktop clients accept this automatically. Web clients must register that exact URI.

Secrets (main process only, encrypted via `safeStorage`):

- `app:google_oauth_client`
- `oauth:drive:refresh:{accountId}`
- `oauth:drive:access:{accountId}`

Renderer never receives refresh tokens.

Connect: **Google Accounts → Connect Drive** (opens system browser for OAuth).

Revoked/expired tokens → sync status `auth_required`; reconnect worker.

## Drive layout (app-owned)

```
NovelTrans/
  <ProjectName>/
    00_BOOK_PROFILE.md
    01_TRANSLATION_RULES.md
    02_PROJECT_TERMS.md
    03_CHARACTERS.md
    04_RELATIONSHIPS.md
    05_STORY_STATE.md
    sources/
```

App creates/updates only these files. Sync compares SHA-256 local hash — **no rewrite when unchanged**.

## Mapping (`drive_resources` + `drive_sync_state`)

| Field | Purpose |
|-------|---------|
| `project_id` | Local project |
| `google_account_id` | Worker OAuth identity |
| `resource_key` | e.g. `00_BOOK_PROFILE.md`, `project_folder` |
| `drive_file_id` | Remote file/folder id |
| `local_hash` / `remote_hash` | Content change detection |
| `remote_modified_time` | Drive modifiedTime |
| `sync_status` | per-resource status |

## Sync schedule

Default: every **10 chapters** or on **critical change** (`markCriticalChange`).

Configurable per project via Projects → Drive Sync panel.

## IPC

| Channel | Action |
|---------|--------|
| `drive:oauthStatus` | Client configured? |
| `drive:setOAuthClient` | Save Desktop credentials |
| `drive:getStatus` | Project sync status |
| `drive:assignWorker` | Bind Google worker |
| `drive:setSchedule` | Chapters interval |
| `drive:provision` | Create folder + files |
| `drive:sync` | Hash-gated update |
| `drive:retry` | Force sync |

Account channels (unchanged names):

- `account:connectDrive` → OAuth connect
- `account:disconnectDrive` → revoke local tokens

## UI

- **Settings** — OAuth Desktop client
- **Google Accounts** — Connect/Disconnect Drive per worker
- **Projects** — Drive Sync panel (status, provision, sync, retry)

## Tests

`tests/unit/drive/drive-sync.test.ts` — mock `DriveClient`, hash skip, schedule, provision.

## Files

- `src/main/drive/drive-oauth-service.ts`
- `src/main/drive/google-drive-api-client.ts`
- `src/main/drive/mock-drive-client.ts`
- `src/main/drive/drive-sync-service.ts`
- `src/main/drive/drive-content-builder.ts`
- Migration `007-drive-sync.ts`
