# User Guide — NovelTrans Studio

## First run

On first launch, the setup wizard walks through:

1. Welcome  
2. App storage (`%APPDATA%\NovelTrans`)  
3. Google account (browser login)  
4. Drive connection (optional — skip allowed)  
5. Import first novel (can continue and import later)  
6. Create Notebook (provision after setup)  
7. Test Gemini / browser profile  
8. Ready  

## Typical workflow

1. **Accounts** — Add Google account; complete Gemini login in the dedicated browser profile.  
1b. **AI Providers** (optional) — Settings → Nhà cung cấp AI: install Web API worker, paste Gemini cookies, set priority / fallback.  
2. **Projects** — Create project from source folder (TXT per chapter); optional `_BOOK_INFO.txt` and prologue files.  
3. **Project info** — Review/edit metadata; sync Book Profile to Notebook (`/projects/:id/info`).  
4. **Terms / Characters** — Review Term Vault and memory.  
5. **Drive** (optional) — Configure OAuth client in Settings; connect account Drive.  
6. **Notebook** — Provision NotebookLM for project + worker (`00_BOOK_PROFILE.md` … `05_STORY_STATE.md`).  
7. **Pack / Jobs** — Build translation pack; enqueue jobs (chapters ordered by `sequence_order`).  
8. **Editor** — Review / lock / version paragraphs.  
9. **Export** — TXT / DOCX / EPUB; backup archives.  
10. **Diagnostics** — Connection tests, selector overrides, repair mode.

## Google Drive OAuth setup

Need when using **Drive** features.

1. Open [Google Cloud Console](https://console.cloud.google.com/). Create project or pick existing project.
2. Go to **APIs & Services → Library**. Enable **Google Drive API**.
3. Go to **APIs & Services → OAuth consent screen**.
4. Set app type to **External**. Fill app name and support email.
5. Add scope:
   - `https://www.googleapis.com/auth/drive.file` for app-managed files only, or
   - `https://www.googleapis.com/auth/drive.readonly` for read-only testing.
6. Add your Google account to **Test users** if app still in testing mode.
7. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
8. Choose **Desktop app**.
9. Download JSON credentials.

Expected JSON shape:

```json
{
  "installed": {
    "client_id": "xxx.apps.googleusercontent.com",
    "client_secret": "GOCSPX-xxx",
    "redirect_uris": [
      "http://127.0.0.1"
    ]
  }
}
```

In NovelTrans Studio:

1. Open **Settings → Google Drive OAuth**.
2. Paste `client_id`.
3. Paste `client_secret` if Google client includes one.
4. Save.
5. Open **Google Accounts** page.
6. Click **Connect Drive** for account you want.

Notes:

- App uses Desktop OAuth loopback flow on localhost / `127.0.0.1`.
- First successful consent should return refresh token. App stores it encrypted.
- If token revoked or expired, Drive status becomes `auth_required`. Reconnect account.
- Do not share downloaded OAuth JSON, refresh tokens, or browser profile files.

## Book metadata (optional)

Place in the same source folder as chapter files:

- `_BOOK_INFO.txt` — key/value metadata (VI / ZH / EN keys)
- `_SUMMARY.txt`, `_AUTHOR_NOTE.txt` — auxiliary documents (not chapters)
- `序章.txt`, `000000_Prologue.txt` — prologue chapters (translated like story content)

No metadata files required — enter info later in **Thông tin truyện**. Official summary ≠ story state updated during translation.

In-app guide: **Hướng dẫn → Dự án** or articles `book-metadata-prep`, `book-profile`. See [BOOK_METADATA.md](./BOOK_METADATA.md).

## Updates

Settings → **Check for Updates**. Without a production update server, the app reports updates unavailable (install new builds manually).

## Backup / restore

Use Export & Backup (`/export`). Full backup excludes browser profiles and credentials by default. Prefer restore preview + confirm overwrite.

## Support data

Do not send cookies, OAuth tokens, or raw browser profiles. Prefer Diagnostics → Export ZIP (sanitized).
