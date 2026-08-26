import http from 'node:http';
import { shell } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import {
  DRIVE_OAUTH_LOOPBACK_PORT,
  DRIVE_OAUTH_REDIRECT_URI,
  DRIVE_OAUTH_SCOPES,
  DRIVE_SECRET_KEYS,
} from '@shared/constants/drive';
import type { SecretStorageService } from '../security/secret-storage-service';
import { DriveAuthError } from './drive-client';
import { GoogleDriveApiClient } from './google-drive-api-client';
import type { DriveClient } from './drive-client';

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret?: string;
}

export interface DriveOAuthTokens {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
}

export interface DriveOAuthConfigStatus {
  configured: boolean;
  clientIdHint: string | null;
  redirectUri: string;
}

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

function oauthHtml(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Segoe UI,sans-serif;max-width:520px;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1c1917}
.ok{color:#166534}.err{color:#9a3412}code{background:#f5f5f4;padding:2px 6px;border-radius:4px}</style></head>
<body><h1>${title}</h1>${body}</body></html>`;
}

/** Extract ?code= from pasted redirect URL or raw code string. */
export function parseOAuthAuthPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      return url.searchParams.get('code');
    }
  } catch {
    // not a URL
  }
  if (/^[\w\-./]+$/.test(trimmed) && trimmed.length > 20) {
    return trimmed;
  }
  if (trimmed.length > 10 && !trimmed.includes(' ')) {
    return trimmed;
  }
  return null;
}

function maskClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 16) return '••••';
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-20)}`;
}

export class DriveOAuthService {
  constructor(private readonly secretStorage: SecretStorageService) {}

  async getClientConfig(): Promise<GoogleOAuthClientConfig | null> {
    const envId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    if (envId) {
      return {
        clientId: envId,
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? undefined,
      };
    }

    const stored = await this.secretStorage.getPlainText(DRIVE_SECRET_KEYS.oauthClient);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as GoogleOAuthClientConfig;
    if (!parsed.clientId) return null;
    return parsed;
  }

  async getConfigStatus(): Promise<DriveOAuthConfigStatus> {
    const config = await this.getClientConfig();
    return {
      configured: config !== null,
      clientIdHint: config ? maskClientId(config.clientId) : null,
      redirectUri: DRIVE_OAUTH_REDIRECT_URI,
    };
  }

  async setClientConfig(config: GoogleOAuthClientConfig): Promise<void> {
    await this.secretStorage.replace({
      secretKey: DRIVE_SECRET_KEYS.oauthClient,
      plainText: JSON.stringify({
        clientId: config.clientId.trim(),
        clientSecret: config.clientSecret?.trim() || undefined,
      }),
      kind: 'other',
      ownerType: 'app',
      ownerId: null,
    });
  }

  hasRefreshToken(accountId: string): boolean {
    return this.secretStorage.getMeta(DRIVE_SECRET_KEYS.refreshToken(accountId)) !== null;
  }

  async connect(accountId: string): Promise<{ email: string | null }> {
    const config = await this.getClientConfig();
    if (!config) {
      throw new Error(
        'Google OAuth client chưa cấu hình. Vào Cài đặt → Google Drive → lưu Client ID.',
      );
    }

    const tokens = await this.runLoopbackOAuth(config);
    return this.persistConnectTokens(accountId, tokens);
  }

  /** Fallback when browser shows connection refused after Google consent. */
  async connectWithAuthPayload(
    accountId: string,
    payload: string,
  ): Promise<{ email: string | null }> {
    const config = await this.getClientConfig();
    if (!config) {
      throw new Error(
        'Google OAuth client chưa cấu hình. Vào Cài đặt → Google Drive → lưu Client ID.',
      );
    }
    const code = parseOAuthAuthPayload(payload);
    if (!code) {
      throw new Error(
        'Không tìm thấy mã authorization (code). Dán cả URL từ thanh địa chỉ trình duyệt sau khi bấm Tiếp tục.',
      );
    }
    const oauth2 = new OAuth2Client(config.clientId, config.clientSecret, DRIVE_OAUTH_REDIRECT_URI);
    const { tokens } = await oauth2.getToken(code);
    return this.persistConnectTokens(accountId, tokens);
  }

  private async persistConnectTokens(
    accountId: string,
    tokens: {
      refresh_token?: string | null;
      access_token?: string | null;
      expiry_date?: number | null;
    },
  ): Promise<{ email: string | null }> {
    if (!tokens.refresh_token && !tokens.access_token) {
      throw new Error(
        'Google không trả refresh token. Thử Connect Drive lại và bấm Tiếp tục; nếu lỗi token, thêm Client Secret (Web client) trong Cài đặt.',
      );
    }

    if (tokens.refresh_token) {
      await this.secretStorage.replace({
        secretKey: DRIVE_SECRET_KEYS.refreshToken(accountId),
        plainText: tokens.refresh_token,
        kind: 'oauth_refresh',
        ownerType: 'google_account',
        ownerId: accountId,
      });
    }

    if (tokens.access_token) {
      await this.storeAccessToken(accountId, tokens.access_token, tokens.expiry_date ?? undefined);
    }

    const client = await this.createAuthorizedClient(accountId);
    const email = client ? await this.fetchUserEmail(client) : null;

    await this.secretStorage.replace({
      secretKey: DRIVE_SECRET_KEYS.tokenMeta(accountId),
      plainText: JSON.stringify({ connectedAt: new Date().toISOString(), email }),
      kind: 'app_token',
      ownerType: 'google_account',
      ownerId: accountId,
    });

    return { email };
  }

  async disconnect(accountId: string): Promise<void> {
    await this.secretStorage.delete(DRIVE_SECRET_KEYS.refreshToken(accountId));
    await this.secretStorage.delete(DRIVE_SECRET_KEYS.accessToken(accountId));
    await this.secretStorage.delete(DRIVE_SECRET_KEYS.tokenMeta(accountId));
    await this.secretStorage.delete(`drive:connected:${accountId}`);
  }

  async createDriveClient(accountId: string): Promise<DriveClient> {
    const auth = await this.createAuthorizedClient(accountId);
    if (!auth) {
      throw new DriveAuthError('Drive OAuth not connected for this worker');
    }
    return new GoogleDriveApiClient(auth);
  }

  private async createAuthorizedClient(accountId: string): Promise<OAuth2Client | null> {
    const config = await this.getClientConfig();
    if (!config) return null;

    const refreshToken = await this.secretStorage.getPlainText(
      DRIVE_SECRET_KEYS.refreshToken(accountId),
    );
    if (!refreshToken) return null;

    const oauth2 = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      DRIVE_OAUTH_REDIRECT_URI,
    );
    oauth2.setCredentials({ refresh_token: refreshToken });

    const accessPlain = await this.secretStorage.getPlainText(
      DRIVE_SECRET_KEYS.accessToken(accountId),
    );
    if (accessPlain) {
      const parsed = JSON.parse(accessPlain) as { accessToken: string; expiryDate?: number };
      oauth2.setCredentials({
        refresh_token: refreshToken,
        access_token: parsed.accessToken,
        expiry_date: parsed.expiryDate,
      });
    }

    oauth2.on('tokens', (tokens) => {
      void this.persistRotatedTokens(accountId, refreshToken, tokens);
    });

    return oauth2;
  }

  private async persistRotatedTokens(
    accountId: string,
    existingRefresh: string,
    tokens: {
      refresh_token?: string | null;
      access_token?: string | null;
      expiry_date?: number | null;
    },
  ): Promise<void> {
    if (tokens.refresh_token && tokens.refresh_token !== existingRefresh) {
      await this.secretStorage.replace({
        secretKey: DRIVE_SECRET_KEYS.refreshToken(accountId),
        plainText: tokens.refresh_token,
        kind: 'oauth_refresh',
        ownerType: 'google_account',
        ownerId: accountId,
      });
    }
    if (tokens.access_token) {
      await this.storeAccessToken(accountId, tokens.access_token, tokens.expiry_date ?? undefined);
    }
  }

  private async storeAccessToken(
    accountId: string,
    accessToken: string,
    expiryDate?: number,
  ): Promise<void> {
    await this.secretStorage.replace({
      secretKey: DRIVE_SECRET_KEYS.accessToken(accountId),
      plainText: JSON.stringify({ accessToken, expiryDate }),
      kind: 'oauth_access',
      ownerType: 'google_account',
      ownerId: accountId,
    });
  }

  private async fetchUserEmail(auth: OAuth2Client): Promise<string | null> {
    try {
      const { google } = await import('googleapis');
      const oauth2 = google.oauth2({ version: 'v2', auth });
      const res = await oauth2.userinfo.get();
      return res.data.email ?? null;
    } catch {
      return null;
    }
  }

  private runLoopbackOAuth(config: GoogleOAuthClientConfig): Promise<{
    refresh_token?: string | null;
    access_token?: string | null;
    expiry_date?: number | null;
  }> {
    const redirectUri = DRIVE_OAUTH_REDIRECT_URI;

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const server = http.createServer((req, res) => {
        void (async () => {
          try {
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.end('Method not allowed');
              return;
            }

            const pathOnly = (req.url ?? '/').split('?')[0] ?? '/';
            if (pathOnly === '/favicon.ico') {
              res.statusCode = 204;
              res.end();
              return;
            }

            const url = new URL(req.url ?? '/', redirectUri);
            const error = url.searchParams.get('error');
            const errorDescription = url.searchParams.get('error_description');
            if (error) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(
                oauthHtml(
                  'Drive — từ chối quyền',
                  `<p class="err">Google trả lỗi: <code>${error}</code></p>` +
                    (errorDescription ? `<p>${errorDescription}</p>` : '') +
                    '<p>Đóng cửa sổ và thử Connect Drive lại trong NovelTrans.</p>',
                ),
              );
              server.close();
              finish(() => {
                reject(new Error(`OAuth error: ${error}${errorDescription ? ` — ${errorDescription}` : ''}`));
              });
              return;
            }

            const code = url.searchParams.get('code');
            if (!code) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(
                oauthHtml(
                  'Thiếu mã authorization',
                  '<p>URL không có tham số <code>code</code>.</p>',
                ),
              );
              return;
            }

            if (!holder.client) {
              throw new Error('OAuth client not ready');
            }

            let tokens;
            try {
              const result = await holder.client.getToken(code);
              tokens = result.tokens;
            } catch (tokenErr) {
              const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(
                oauthHtml(
                  'Đổi mã thất bại',
                  `<p class="err">${msg}</p>` +
                    '<p>Web client thường cần <strong>Client Secret</strong> trong Cài đặt. Desktop app thì không.</p>' +
                    `<p>Nếu trình duyệt báo không kết nối được, copy URL có <code>code=</code> rồi dán vào NovelTrans (Accounts → Dán URL OAuth).</p>`,
                ),
              );
              server.close();
              finish(() => {
                reject(new Error(`OAuth token exchange failed: ${msg}`));
              });
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(
              oauthHtml(
                'Drive đã kết nối',
                '<p class="ok"><strong>Thành công.</strong> Quay lại NovelTrans Studio — có thể đóng tab này.</p>',
              ),
            );
            server.close();
            finish(() => {
              resolve(tokens);
            });
          } catch (err) {
            server.close();
            finish(() => {
              reject(err instanceof Error ? err : new Error(String(err)));
            });
          }
        })();
      });

      const holder: { client?: OAuth2Client } = {};

      server.once('error', (err) => {
        finish(() => {
          reject(
            new Error(
              `Không mở được cổng OAuth ${redirectUri}: ${err.message}. Đóng app khác dùng cổng ${DRIVE_OAUTH_LOOPBACK_PORT}, cho phép NovelTrans qua Windows Firewall, rồi thử lại.`,
            ),
          );
        });
      });

      server.listen(DRIVE_OAUTH_LOOPBACK_PORT, '127.0.0.1', () => {
        holder.client = new OAuth2Client(config.clientId, config.clientSecret, redirectUri);
        const authUrl = holder.client.generateAuthUrl({
          access_type: 'offline',
          scope: [...DRIVE_OAUTH_SCOPES],
          prompt: 'consent',
          redirect_uri: redirectUri,
        });
        void shell.openExternal(authUrl);
      });

      const timer = setTimeout(() => {
        server.close();
        finish(() => {
          reject(
            new Error(
              'Hết thời gian chờ OAuth (5 phút). Sau khi bấm Tiếp tục trên Google, nếu trình duyệt báo không kết nối được — copy URL thanh địa chỉ (có code=) và dán vào Accounts → Dán URL OAuth.',
            ),
          );
        });
      }, OAUTH_TIMEOUT_MS);
    });
  }
}
