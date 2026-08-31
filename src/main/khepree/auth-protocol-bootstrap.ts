import { app } from 'electron';
import path from 'node:path';
import { KHEPREE_AUTH_PROTOCOL_SCHEME } from '@shared/constants/khepree';
import { extractAuthCallbackUrlFromArgv } from './oauth-auth-transaction';
import { getKhepreeAccessService } from './khepree-access-singleton';
import { focusKhepreeMainWindow } from './access-state-bridge';
import { logger } from '../logging/logger';

let queuedAuthCallbackUrl: string | null = null;

function routeAuthCallback(rawUrl: string): void {
  try {
    getKhepreeAccessService().handleAuthCallbackUrl(rawUrl);
    queuedAuthCallbackUrl = null;
    focusKhepreeMainWindow();
  } catch (error) {
    queuedAuthCallbackUrl = rawUrl;
    logger.info('Khepree OAuth callback queued until access service ready', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export function flushQueuedKhepreeAuthCallback(): void {
  if (!queuedAuthCallbackUrl) return;
  const url = queuedAuthCallbackUrl;
  queuedAuthCallbackUrl = null;
  routeAuthCallback(url);
}

export function registerKhepreeAuthProtocolClient(): void {
  if (process.platform === 'win32' || process.platform === 'linux') {
    if (!app.isPackaged && process.defaultApp) {
      app.setAsDefaultProtocolClient(
        KHEPREE_AUTH_PROTOCOL_SCHEME,
        process.execPath,
        [path.resolve(process.argv[1] ?? '.')],
      );
    } else {
      app.setAsDefaultProtocolClient(KHEPREE_AUTH_PROTOCOL_SCHEME);
    }
  } else if (process.platform === 'darwin') {
    app.setAsDefaultProtocolClient(KHEPREE_AUTH_PROTOCOL_SCHEME);
  }
}

export function installKhepreeAuthDeepLinkHandlers(): void {
  registerKhepreeAuthProtocolClient();

  app.on('second-instance', (_event, argv) => {
    const url = extractAuthCallbackUrlFromArgv(argv);
    if (url) {
      routeAuthCallback(url);
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    routeAuthCallback(url);
  });

  const initialUrl = extractAuthCallbackUrlFromArgv(process.argv);
  if (initialUrl) {
    queuedAuthCallbackUrl = initialUrl;
  }
}
