import type { BrowserWindow, HandlerDetails } from 'electron';
import { shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logging/logger';
import { sanitizeUrlForLog } from '../security/log-sanitize';

/** External opens from renderer navigation — https/mailto only (no http downgrade). */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:']);

/**
 * Navigation + external URL restrictions for the main BrowserWindow.
 * Blocks unexpected navigations and opens safe external URLs in the OS browser.
 */
export function attachWindowSecurityGuards(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    void openExternalIfAllowed(details.url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInternalNavigation(win, url)) {
      return;
    }
    event.preventDefault();
    logger.warn('Blocked renderer navigation', { url: sanitizeUrlForLog(url) });
    void openExternalIfAllowed(url);
  });

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    logger.warn('Blocked webview attach');
  });
}

function isAllowedInternalNavigation(win: BrowserWindow, url: string): boolean {
  try {
    const current = win.webContents.getURL();
    if (!current) return false;
    if (url === current) return true;

    // Dev server
    if (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')) {
      return current.startsWith('http://localhost:') || current.startsWith('http://127.0.0.1:');
    }

    // Production file:// renderer — only same directory as current document (no arbitrary local file).
    if (url.startsWith('file:') && current.startsWith('file:')) {
      const currentPath = fileURLToPath(current);
      const nextPath = fileURLToPath(url);
      const currentDir = path.dirname(currentPath);
      const nextDir = path.dirname(nextPath);
      return path.resolve(currentDir) === path.resolve(nextDir);
    }

    return false;
  } catch {
    return false;
  }
}

async function openExternalIfAllowed(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      logger.warn('Blocked external URL protocol', { url: sanitizeUrlForLog(url) });
      return;
    }
    await shell.openExternal(url);
  } catch (error) {
    logger.warn('Failed to open external URL', {
      url: sanitizeUrlForLog(url),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
