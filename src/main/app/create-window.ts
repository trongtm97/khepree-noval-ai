import fs from 'node:fs';
import { BrowserWindow, nativeTheme } from 'electron';
import path from 'node:path';
import { APP_NAME } from '@shared/constants/app';
import { attachWindowSecurityGuards } from './window-security';

const TITLE_BAR_HEIGHT = 32;

function getTitleBarOverlay(): Electron.TitleBarOverlay | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }

  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    color: isDark ? '#0D0F12' : '#F8F9FA',
    symbolColor: isDark ? '#F3F4F6' : '#212529',
    height: TITLE_BAR_HEIGHT,
  };
}

function resolveWindowIcon(): string | undefined {
  const candidates = [
    path.join(process.cwd(), 'resources', 'icon.ico'),
    path.join(__dirname, '..', '..', 'resources', 'icon.ico'),
    path.join(__dirname, '..', '..', '..', 'resources', 'icon.ico'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function createMainWindow(): BrowserWindow {
  const iconPath = resolveWindowIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: APP_NAME,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0D0F12' : '#F8F9FA',
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: getTitleBarOverlay(),
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  attachWindowSecurityGuards(win);

  nativeTheme.on('updated', () => {
    if (process.platform === 'win32' && !win.isDestroyed()) {
      const overlay = getTitleBarOverlay();
      if (overlay) {
        win.setTitleBarOverlay(overlay);
      }
      win.setBackgroundColor(
        nativeTheme.shouldUseDarkColors ? '#0D0F12' : '#F8F9FA',
      );
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return win;
}

export function getTitleBarHeight(): number {
  return process.platform === 'win32' ? TITLE_BAR_HEIGHT : 0;
}
