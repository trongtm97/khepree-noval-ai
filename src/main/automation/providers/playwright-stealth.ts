/** Stealth init script for Playwright browser AI providers (ChatGPT, Meta AI). */
export const PLAYWRIGHT_STEALTH_INIT_SCRIPT = (): void => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  const w = window as Window & { chrome?: unknown };
  if (!w.chrome) {
    w.chrome = {
      app: {
        isInstalled: false,
        getDetails: () => null,
        getIsInstalled: () => false,
      },
      runtime: {
        connect: () => ({
          onDisconnect: { addListener: () => {} },
          onMessage: { addListener: () => {} },
        }),
        sendMessage: () => {},
        id: undefined,
      },
    } as typeof w.chrome;
  }

  if (navigator.permissions?.query) {
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (parameters: PermissionDescriptor) =>
      parameters?.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  }

  Object.defineProperty(navigator, 'languages', {
    get: () => ['vi-VN', 'vi', 'en-US', 'en'],
  });
};

export async function applyPlaywrightStealth(
  context: { addInitScript: (fn: () => void) => Promise<unknown> },
): Promise<void> {
  await context.addInitScript(PLAYWRIGHT_STEALTH_INIT_SCRIPT);
}
