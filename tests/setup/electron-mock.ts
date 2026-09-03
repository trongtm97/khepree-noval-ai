import { vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.1.0-test',
    getLocale: () => 'en-US',
    getPath: () => '',
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
    setAppUserModelId: vi.fn(),
    requestSingleInstanceLock: () => true,
  },
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
}));
