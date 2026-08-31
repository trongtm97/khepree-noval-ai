import http from 'node:http';
import { URL } from 'node:url';
import { KHEPREE_OAUTH_CALLBACK_PATH } from '@shared/constants/khepree';

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

export class OAuthLoopbackServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(): Promise<{ redirectUri: string; port: number }> {
    await this.stop();
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind OAuth loopback server'));
          return;
        }
        this.server = server;
        this.port = address.port;
        resolve({
          port: address.port,
          redirectUri: `http://127.0.0.1:${address.port}${KHEPREE_OAUTH_CALLBACK_PATH}`,
        });
      });
    });
  }

  private pendingResolve: ((result: OAuthCallbackResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private expectedState: string | null = null;

  waitForCallback(expectedState: string, timeoutMs = 5 * 60 * 1000): Promise<OAuthCallbackResult> {
    this.expectedState = expectedState;
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      setTimeout(() => {
        if (this.pendingReject) {
          this.pendingReject(new Error('OAuth login timed out'));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      }, timeoutMs);
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
      if (url.pathname !== KHEPREE_OAUTH_CALLBACK_PATH) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(400);
        res.end('Login failed. You may close this window.');
        this.pendingReject?.(new Error(error));
        this.pendingResolve = null;
        this.pendingReject = null;
        return;
      }
      if (!code || !state || state !== this.expectedState) {
        res.writeHead(400);
        res.end('Invalid callback.');
        this.pendingReject?.(new Error('Invalid OAuth callback'));
        this.pendingResolve = null;
        this.pendingReject = null;
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<html><body><h2>Login successful</h2><p>You may close this window and return to Khepree Novel AI.</p></body></html>',
      );
      this.pendingResolve?.({ code, state });
      this.pendingResolve = null;
      this.pendingReject = null;
    } catch (err) {
      res.writeHead(500);
      res.end('Error');
      this.pendingReject?.(err instanceof Error ? err : new Error(String(err)));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server?.close(() => {
        resolve();
      });
    });
    this.server = null;
    this.port = 0;
  }
}
