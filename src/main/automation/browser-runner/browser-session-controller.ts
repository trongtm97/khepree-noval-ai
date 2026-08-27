/**
 * Browser session operations for Google account login / health checks.
 * Injectable for unit tests — production uses Playwright Chromium.
 */

export interface SessionProbeResult {
  usable: boolean;
  email: string | null;
  displayName: string | null;
  reason?: string;
}

/** Cookies required by Gemini Web API worker (`gemini_webapi`). */
export interface GeminiSessionCookies {
  secure1psid: string;
  secure1psidts: string;
}

export interface BrowserSessionHandle {
  profilePath: string;
  close: () => Promise<void>;
  probeSession: () => Promise<SessionProbeResult>;
  /** Read __Secure-1PSID / __Secure-1PSIDTS from the live browser profile. */
  extractGeminiCookies: () => Promise<GeminiSessionCookies>;
  /** False after user/OS closes the Chromium window or context. */
  isOpen: () => boolean;
  /** Focus existing window and navigate to URL. */
  focus: (url?: string) => Promise<void>;
}

export interface OpenBrowserOptions {
  accountId: string;
  profilePath: string;
  startUrl: string;
  headless?: boolean;
  /** Fired when persistent context closes (window quit). */
  onClose?: () => void;
}

export interface BrowserSessionController {
  open(options: OpenBrowserOptions): Promise<BrowserSessionHandle>;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** Google interstitial when automation / unsupported browser is detected. */
const INSECURE_BROWSER_RE =
  /may not be secure|try using a different browser|trình duyệt hoặc ứng dụng này có thể không an toàn|hãy dùng trình duyệt khác/i;

export function extractEmailFromText(text: string): string | null {
  const match = EMAIL_REGEX.exec(text);
  return match ? match[0].toLowerCase() : null;
}

export function pickGeminiCookies(
  cookies: readonly { name: string; value: string }[],
): GeminiSessionCookies {
  const secure1psid =
    cookies.find((cookie) => cookie.name === '__Secure-1PSID')?.value ?? '';
  const secure1psidts =
    cookies.find((cookie) => cookie.name === '__Secure-1PSIDTS')?.value ?? '';
  return { secure1psid, secure1psidts };
}

export function looksLikeGoogleLoginPage(url: string, content: string): boolean {
  if (!/accounts\.google\.com/i.test(url)) {
    return false;
  }
  return (
    /signin|ServiceLogin|identifier|challenge/i.test(url) ||
    /identifierId|accountIdentifier/i.test(content)
  );
}

/** Detect Google "This browser or app may not be secure" interstitial. */
export function looksLikeInsecureBrowserInterstitial(
  _url: string,
  bodyText: string,
): boolean {
  return INSECURE_BROWSER_RE.test(bodyText);
}

/**
 * Production Playwright-backed controller.
 * Does not bypass 2FA/CAPTCHA — user completes login manually.
 */
export class PlaywrightBrowserSessionController implements BrowserSessionController {
  async open(options: OpenBrowserOptions): Promise<BrowserSessionHandle> {
    const { launchNovelTransPersistentContext } = await import(
      './launch-persistent-context'
    );
    const { resolveLoginBrowserPreference } = await import('./browser-engine-resolver');
    const enginePreference = resolveLoginBrowserPreference();
    const { context } = await launchNovelTransPersistentContext({
      profilePath: options.profilePath,
      headless: options.headless ?? false,
      headlessDefault: false,
      enginePreference,
      loginCompat: true,
    });

    let closed = false;
    const markClosed = () => {
      if (closed) return;
      closed = true;
      options.onClose?.();
    };
    context.on('close', markClosed);

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(options.startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    return {
      profilePath: options.profilePath,
      isOpen: () => !closed && context.browser()?.isConnected() !== false,
      focus: async (url) => {
        if (closed) {
          throw new Error('Browser session already closed');
        }
        const target = context.pages()[0] ?? (await context.newPage());
        await target.bringToFront();
        if (url) {
          await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        }
      },
      close: async () => {
        if (closed) return;
        await context.close();
        markClosed();
      },
      probeSession: async () => {
        try {
          if (closed) {
            return {
              usable: false,
              email: null,
              displayName: null,
              reason: 'SESSION_CLOSED',
            };
          }
          const active = context.pages()[0] ?? page;
          const url = active.url();
          const content = await active.content();
          const bodyText = await active.locator('body').innerText().catch(() => '');

          if (looksLikeInsecureBrowserInterstitial(url, bodyText)) {
            return {
              usable: false,
              email: null,
              displayName: null,
              reason: 'BROWSER_NOT_SECURE',
            };
          }

          if (looksLikeGoogleLoginPage(url, content)) {
            return {
              usable: false,
              email: null,
              displayName: null,
              reason: 'LOGIN_REQUIRED',
            };
          }

          const captcha =
            /unusual traffic|recaptcha|captcha/i.test(bodyText) ||
            /challenge/i.test(url);
          if (captcha) {
            return {
              usable: false,
              email: null,
              displayName: null,
              reason: 'NEEDS_ATTENTION',
            };
          }

          const email =
            extractEmailFromText(bodyText) ??
            extractEmailFromText(content);

          // Heuristic: Gemini/Google home without sign-in chrome
          const usable =
            Boolean(email) ||
            /gemini\.google\.com/i.test(url) ||
            /myaccount\.google\.com/i.test(url) ||
            /drive\.google\.com/i.test(url);

          return {
            usable,
            email,
            displayName: email,
            reason: usable ? undefined : 'SESSION_UNKNOWN',
          };
        } catch (error) {
          return {
            usable: false,
            email: null,
            displayName: null,
            reason: error instanceof Error ? error.message : 'PROBE_FAILED',
          };
        }
      },
      extractGeminiCookies: async () => {
        if (closed) {
          return { secure1psid: '', secure1psidts: '' };
        }
        const cookies = await context.cookies([
          'https://gemini.google.com',
          'https://google.com',
          'https://www.google.com',
        ]);
        return pickGeminiCookies(cookies);
      },
    };
  }
}
