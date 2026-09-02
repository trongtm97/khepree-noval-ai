# User Guide — Khepree Novel AI

Khepree Novel AI is a Windows desktop app for AI-assisted **multilingual** novel translation. You choose source (auto-detected) and target languages per project/edition. AI providers include **Gemini**, **ChatGPT**, and **Meta AI** — connect at least one; Google account is required **only for Gemini paths**, not for ChatGPT or Meta AI alone.

## First run

On first launch, the setup wizard walks through:

1. Welcome  
2. App storage (`%APPDATA%\KhepreeNovelAI`)  
3. **Connect AI** — pick Gemini, ChatGPT, or Meta AI (not Google-only)  
4. Import first novel (can skip and import later)  
5. Optional Research Notebook setup (skip allowed — local knowledge is default)  
6. Verify AI session in browser profile  
7. Ready  

## Typical workflow

1. **Accounts / AI** — Add and verify at least one provider:
   - **Gemini:** Google account + headed browser login in dedicated profile (or Web API cookies in Settings).
   - **ChatGPT / Meta AI:** Open provider login browser; sign in manually; Verify — **no Google account needed**.
2. **Projects** — Create project from source folder (TXT per chapter); optional `_BOOK_INFO.txt` and prologue files. Set source + target language.  
3. **Project info** — Review/edit metadata; optional Book Profile sync to Research Notebook.  
4. **Terms / Characters** — Review Term Vault and memory.  
5. **Optional Research Notebook** — NotebookLM grounding for research; core translation works from local SQLite knowledge without it.  
6. **Jobs** — Enqueue translation jobs (chapters ordered by `sequence_order`); provider shown on running jobs.  
7. **Translation workspace** — Review / lock / version paragraphs.  
8. **Export** — TXT / DOCX / EPUB; backup archives.  
9. **Diagnostics** — Connection tests, selector overrides, repair mode.

## AI providers (Settings → Nhà cung cấp AI)

| Provider | What you need |
|----------|----------------|
| Gemini (browser) | Google sign-in in Khepree Novel AI browser profile |
| Gemini Web API | Python worker + session cookies |
| ChatGPT | ChatGPT sign-in in dedicated profile |
| Meta AI | Meta sign-in in dedicated profile |

Enable priority and optional fallback between providers. Jobs use the project's configured provider / routing policy.

## Google account (Gemini only)

When using Playwright Gemini or optional NotebookLM research:

1. **Accounts** → Add Google account.  
2. Complete sign-in in the headed browser window (password, 2FA, CAPTCHA — you handle manually).  
3. **Verify** when prompted.  

Session persists in `%APPDATA%\KhepreeNovelAI\browser-profiles\` — not your normal Chrome profile.

## Optional Research Notebook

NotebookLM can ground AI with uploaded knowledge files. **Not required** for translation — local markdown built from SQLite is the default context.

Project → **Bộ nhớ AI**: bootstrap / rebuild local knowledge; optionally provision Research Notebook when you want NotebookLM grounding.

## Backups

Settings → Portability: automatic daily backups, manual export, restore preview. All data stays under `%APPDATA%\KhepreeNovelAI\`.

## Getting help / Contact Khepree Labs

- **Help** (sidebar or `F1`) → **Liên hệ & cộng đồng** / **Contact & Community** (`/help/contact`) — official Facebook, YouTube, TikTok, Telegram, and Zalo links open in your default browser.
- **Settings → General** → **Khepree Labs** → **View contact information** — same Help article.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for CAPTCHA, session expiry, provider login, and job recovery.

## Licensing

Khepree Novel AI requires an active **Khepree** account entitlement for translation workspace features. Sign in via **Khepree → Sign in** (system browser — password never stored in the app).

## Khepree commercial access

### First installation

1. Install Khepree Novel AI from the Windows installer.  
2. On first launch, choose **Vietnamese** or **English** — preference persists across restarts.  
3. Open **Khepree → Sign in** — complete login in your system browser.  
4. If entitled, the app activates this device and verifies your lease automatically.  
5. If not entitled, use **Plan** to purchase or upgrade; polling confirms entitlement without restart.  
6. Use Projects, Jobs, and translation features when status is **Active**.

### New computer

1. On [account.khepree.com](https://account.khepree.com), open **Devices** and remove an old device if at the limit.  
2. Install or open Khepree Novel AI on the new PC.  
3. **Khepree → Sign in**.  
4. Click **Retry Activation** if prompted after device removal.

### Upgrade

1. **Khepree → Plan → Upgrade** (or purchase from entitlement gate).  
2. Complete checkout in the system browser.  
3. Return to the app — status updates automatically when Khepree confirms payment (do not trust browser URL alone).  
4. New plan features appear without restarting.

### Khepree hub pages

| Page | Purpose |
|------|---------|
| Account | Profile, sign out (revokes session; does not deactivate device on server) |
| Plan | Catalog, upgrade, checkout waiting |
| Devices | Local device info, link to manage devices on account.khepree.com |
| About | Product version and links |

See [KHEPREE_ACCEPTANCE.md](./KHEPREE_ACCEPTANCE.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#khepree-access).
