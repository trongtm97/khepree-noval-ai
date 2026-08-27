import type { Page } from 'playwright';
import { captureFailureDiagnostics } from '../../../diagnostics';
import type { UiSurface } from './surface-ids';

export interface SurfaceDetectionResult {
  surface: UiSurface;
  via: 'url' | 'dom' | 'fixture' | 'fallback';
  evidence: string[];
  url: string;
  title: string;
}

/**
 * Detect which product shell the page is on.
 * Uses URL host/path + unique shell evidence — never bare h1/button/contenteditable alone.
 */
export async function detectUiSurface(page: Page): Promise<SurfaceDetectionResult> {
  let url = '';
  let title = '';
  try {
    url = page.url();
  } catch {
    url = '';
  }
  try {
    title = await page.title();
  } catch {
    title = '';
  }

  const hostPath = (() => {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (
    hostPath.includes('accounts.google.com') ||
    /\/signin|\/ServiceLogin|\/v3\/signin/i.test(hostPath)
  ) {
    return {
      surface: 'GOOGLE_LOGIN',
      via: 'url',
      evidence: ['url:accounts.google'],
      url,
      title,
    };
  }

  const fixture = await page
    .evaluate(() => {
      const root =
        document.querySelector('[data-surface]') ??
        document.querySelector('[data-testid="gemini-app"]') ??
        document.querySelector('[data-testid="gemini-notebook-app"]') ??
        document.querySelector('[data-testid="notebooklm-app"]') ??
        document.querySelector('[data-gemini-app]') ??
        document.querySelector('[data-gemini-notebook-app]') ??
        document.querySelector('[data-notebooklm-app]');
      if (!root) return null;
      const surface = root.getAttribute('data-surface');
      const testId = root.getAttribute('data-testid');
      return { surface, testId };
    })
    .catch(() => null);

  if (fixture?.surface === 'gemini-chat' || fixture?.testId === 'gemini-app') {
    return {
      surface: 'GEMINI_CHAT',
      via: 'fixture',
      evidence: [`fixture:${fixture.surface ?? fixture.testId}`],
      url,
      title,
    };
  }
  if (
    fixture?.surface === 'gemini-notebook' ||
    fixture?.testId === 'gemini-notebook-app'
  ) {
    return {
      surface: 'GEMINI_NOTEBOOK',
      via: 'fixture',
      evidence: [`fixture:${fixture.surface ?? fixture.testId}`],
      url,
      title,
    };
  }
  if (fixture?.surface === 'notebooklm' || fixture?.testId === 'notebooklm-app') {
    return {
      surface: 'NOTEBOOKLM',
      via: 'fixture',
      evidence: [`fixture:${fixture.surface ?? fixture.testId}`],
      url,
      title,
    };
  }

  if (hostPath.includes('gemini.google.com')) {
    const shell = await probeShell(page, [
      'chat-app',
      'bard-sidenav-container',
      'rich-textarea',
      '[data-gemini-app]',
    ]);
    if (shell.length > 0) {
      return {
        surface: 'GEMINI_CHAT',
        via: 'url',
        evidence: ['url:gemini.google.com', ...shell],
        url,
        title,
      };
    }
    return {
      surface: 'GEMINI_CHAT',
      via: 'url',
      evidence: ['url:gemini.google.com'],
      url,
      title,
    };
  }

  if (hostPath.includes('notebooklm.google.com')) {
    const shell = await probeShell(page, [
      'labs-tailwind-root',
      'chat-panel',
      'query-box',
      'welcome-page',
      '[data-notebooklm-app]',
    ]);
    return {
      surface: 'NOTEBOOKLM',
      via: 'url',
      evidence: ['url:notebooklm.google.com', ...shell],
      url,
      title,
    };
  }

  if (hostPath.includes('notebook.google.com')) {
    const geminiNotebook = await page
      .locator("a[aria-label*='Gemini Notebook' i], button[aria-label*='Gemini Notebook' i]")
      .first()
      .isVisible()
      .catch(() => false);
    if (geminiNotebook) {
      const shell = await probeShell(page, ['chat-panel', 'query-box', 'labs-tailwind-root']);
      return {
        surface: 'GEMINI_NOTEBOOK',
        via: 'dom',
        evidence: ['url:notebook.google.com', 'aria:Gemini Notebook', ...shell],
        url,
        title,
      };
    }
    const shell = await probeShell(page, [
      'labs-tailwind-root',
      'chat-panel',
      'query-box',
      'welcome-page',
    ]);
    if (shell.length > 0) {
      return {
        surface: 'NOTEBOOKLM',
        via: 'dom',
        evidence: ['url:notebook.google.com', ...shell],
        url,
        title,
      };
    }
  }

  // DOM-only fallback when URL is localhost fixture / about:blank mid-nav
  const domHits = await page
    .evaluate(() => {
      const hits: string[] = [];
      if (document.querySelector('chat-app, bard-sidenav-container, rich-textarea')) {
        hits.push('shell:gemini-chat');
      }
      if (
        document.querySelector("a[aria-label*='Gemini Notebook' i]") ||
        document.querySelector('[data-gemini-notebook-app]')
      ) {
        hits.push('shell:gemini-notebook');
      }
      if (
        document.querySelector('labs-tailwind-root, chat-panel, query-box, welcome-page') ||
        document.querySelector('[data-notebooklm-app]')
      ) {
        hits.push('shell:notebooklm');
      }
      if (
        document.body.innerText &&
        /sign in|đăng nhập/i.test(document.body.innerText.slice(0, 500)) &&
        document.querySelector('[data-testid="login-required"], input[type="email"]')
      ) {
        hits.push('shell:google-login');
      }
      return hits;
    })
    .catch(() => [] as string[]);

  if (domHits.includes('shell:google-login')) {
    return {
      surface: 'GOOGLE_LOGIN',
      via: 'dom',
      evidence: domHits,
      url,
      title,
    };
  }
  if (domHits.includes('shell:gemini-chat') && !domHits.includes('shell:notebooklm')) {
    return {
      surface: 'GEMINI_CHAT',
      via: 'dom',
      evidence: domHits,
      url,
      title,
    };
  }
  if (domHits.includes('shell:gemini-notebook')) {
    return {
      surface: 'GEMINI_NOTEBOOK',
      via: 'dom',
      evidence: domHits,
      url,
      title,
    };
  }
  if (domHits.includes('shell:notebooklm')) {
    return {
      surface: 'NOTEBOOKLM',
      via: 'dom',
      evidence: domHits,
      url,
      title,
    };
  }

  return {
    surface: 'UNKNOWN',
    via: 'fallback',
    evidence: ['no-unique-shell'],
    url,
    title,
  };
}

async function probeShell(page: Page, selectors: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const css of selectors) {
    const hit = await page
      .locator(css)
      .first()
      .isVisible()
      .catch(() => false);
    if (hit) found.push(`css:${css}`);
  }
  return found;
}

/** Capture URL / title / screenshot / sanitized DOM when surface cannot be identified. */
export async function captureUnknownSurfaceDiagnostics(input: {
  page: Page;
  diagnosticsDir: string;
  detection: SurfaceDetectionResult;
}): Promise<void> {
  await captureFailureDiagnostics({
    page: input.page,
    diagnosticsDir: input.diagnosticsDir,
    operationName: 'surface:UNKNOWN',
    tag: 'unknown-surface',
    selectorKey: 'surface',
    selectorCandidates: [
      `url=${input.detection.url}`,
      `title=${input.detection.title}`,
      ...input.detection.evidence,
    ],
  });
}
