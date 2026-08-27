import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { AutomationFailureDiagnostics } from './protocol';
import type { AutomationTimelineSnapshot } from './automation-timeline';

const MAX_HTML_SNAPSHOT_BYTES = 64 * 1024;
const MAX_DOM_FRAGMENT_BYTES = 16 * 1024;
const REDACT_PATTERNS = [
  /cookie/gi,
  /authorization/gi,
  /bearer\s+[a-z0-9._-]+/gi,
  /access[_-]?token/gi,
  /refresh[_-]?token/gi,
  /oauth[_-]?token/gi,
  /localStorage/gi,
  /sessionStorage/gi,
];

export interface CaptureDiagnosticsInput {
  page: Page | null;
  diagnosticsDir: string;
  operationName: string;
  tag?: string;
  selectorKey?: string;
  selectorCandidates?: string[];
  browserEngine?: string | null;
  browserEnginePreference?: string | null;
  playwrightVersion?: string | null;
  browserChannel?: string | null;
  browserEngineVersion?: string | null;
  errorCode?: string | null;
  surface?: string | null;
  expectedNotebookUrl?: string | null;
  actualNotebookUrl?: string | null;
  selectorStrategyWinner?: string | null;
  composerTextLength?: number | null;
  composerTextHash?: string | null;
  conversationCountBefore?: number | null;
  conversationCountAfter?: number | null;
  sendEvidence?: unknown;
  responseEvidence?: unknown;
  consoleErrors?: string[];
  pageErrors?: string[];
  timeline?: AutomationTimelineSnapshot | null;
  failedStep?: string | null;
  lastOkStep?: string | null;
  tracePath?: string | null;
}

/**
 * Capture failure diagnostics without cookies/tokens.
 * On SELECTOR_NOT_FOUND: screenshot, URL, title, sanitized DOM fragment, operation, candidates.
 */
export async function captureFailureDiagnostics(
  input: CaptureDiagnosticsInput,
): Promise<AutomationFailureDiagnostics> {
  const timestamp = new Date().toISOString();
  const safeTag = (input.tag ?? input.operationName)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 64);
  const stamp = timestamp.replace(/[:.]/g, '-');

  fs.mkdirSync(input.diagnosticsDir, { recursive: true });

  let screenshotPath: string | null = null;
  let htmlSnapshotPath: string | null = null;
  let domFragmentPath: string | null = null;
  let currentUrl: string | null = null;
  let pageTitle: string | null = null;

  if (input.page) {
    try {
      currentUrl = input.page.url();
    } catch {
      currentUrl = null;
    }

    try {
      pageTitle = await input.page.title();
    } catch {
      pageTitle = null;
    }

    const shotFile = path.join(input.diagnosticsDir, `${safeTag}-${stamp}.png`);
    try {
      await input.page.screenshot({ path: shotFile, fullPage: true });
      screenshotPath = shotFile;
    } catch {
      screenshotPath = null;
    }

    const htmlFile = path.join(input.diagnosticsDir, `${safeTag}-${stamp}.html`);
    try {
      const html = await input.page.content();
      const sanitized = sanitizeHtmlSnapshot(html);
      fs.writeFileSync(htmlFile, sanitized, 'utf8');
      htmlSnapshotPath = htmlFile;
    } catch {
      htmlSnapshotPath = null;
    }

    const fragmentFile = path.join(
      input.diagnosticsDir,
      `${safeTag}-${stamp}.fragment.html`,
    );
    try {
      const fragment = await captureDomFragment(input.page);
      if (fragment) {
        fs.writeFileSync(fragmentFile, sanitizeHtmlSnapshot(fragment, MAX_DOM_FRAGMENT_BYTES), 'utf8');
        domFragmentPath = fragmentFile;
      }
    } catch {
      domFragmentPath = null;
    }
  }

  const engineMeta = readEngineInfoFromDir(input.diagnosticsDir);
  const timeline = input.timeline ?? null;
  let timelinePath: string | null = null;
  if (timeline) {
    timelinePath = path.join(input.diagnosticsDir, `${safeTag}-${stamp}.timeline.json`);
    try {
      fs.writeFileSync(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`, 'utf8');
    } catch {
      timelinePath = null;
    }
  }

  return {
    screenshotPath,
    htmlSnapshotPath,
    domFragmentPath,
    currentUrl,
    pageTitle,
    operationName: input.operationName,
    errorCode: input.errorCode ?? null,
    selectorKey: input.selectorKey ?? null,
    selectorCandidates: input.selectorCandidates ?? [],
    timestamp,
    browserEngine: input.browserEngine ?? engineMeta?.engine ?? null,
    browserEnginePreference:
      input.browserEnginePreference ?? engineMeta?.preference ?? null,
    playwrightVersion:
      input.playwrightVersion ?? engineMeta?.playwrightVersion ?? null,
    browserChannel: input.browserChannel ?? engineMeta?.channel ?? null,
    browserEngineVersion: input.browserEngineVersion ?? null,
    surface: input.surface ?? null,
    expectedNotebookUrl: input.expectedNotebookUrl ?? null,
    actualNotebookUrl: input.actualNotebookUrl ?? currentUrl,
    selectorStrategyWinner: input.selectorStrategyWinner ?? null,
    composerTextLength: input.composerTextLength ?? null,
    composerTextHash: input.composerTextHash ?? null,
    conversationCountBefore: input.conversationCountBefore ?? null,
    conversationCountAfter: input.conversationCountAfter ?? null,
    sendEvidence: input.sendEvidence ?? null,
    responseEvidence: input.responseEvidence ?? null,
    consoleErrors: (input.consoleErrors ?? []).map(redactDiagnosticText).slice(0, 40),
    pageErrors: (input.pageErrors ?? []).map(redactDiagnosticText).slice(0, 40),
    timeline,
    failedStep: input.failedStep ?? timeline?.failedStep ?? null,
    lastOkStep: input.lastOkStep ?? timeline?.lastOkStep ?? null,
    timelinePath,
    tracePath: input.tracePath ?? null,
  };
}

function readEngineInfoFromDir(
  diagnosticsDir: string,
): {
  engine?: string;
  preference?: string;
  playwrightVersion?: string;
  channel?: string | null;
} | null {
  try {
    const filePath = path.join(diagnosticsDir, 'engine-info.json');
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      engine?: string;
      preference?: string;
      playwrightVersion?: string;
      channel?: string | null;
    };
    return parsed;
  } catch {
    return null;
  }
}

async function captureDomFragment(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const root =
        document.querySelector('main') ??
        document.querySelector('[role="main"]') ??
        document.body;
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript').forEach((el) => {
        el.remove();
      });
      clone.querySelectorAll('input[type="password"]').forEach((el) => {
        (el as HTMLInputElement).value = '';
        el.setAttribute('value', '');
      });
      const html = clone.outerHTML;
      return html.length > 24_000 ? `${html.slice(0, 24_000)}\n<!-- truncated -->` : html;
    });
  } catch {
    return null;
  }
}

export function sanitizeHtmlSnapshot(
  html: string,
  maxBytes = MAX_HTML_SNAPSHOT_BYTES,
): string {
  let cleaned = html;
  for (const pattern of REDACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }

  cleaned = cleaned.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    '<script>[REDACTED]</script>',
  );

  // Strip password field values
  cleaned = cleaned.replace(
    /(<input\b[^>]*type\s*=\s*["']password["'][^>]*value\s*=\s*)["'][^"']*["']/gi,
    '$1""',
  );

  if (Buffer.byteLength(cleaned, 'utf8') <= maxBytes) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxBytes)}\n<!-- truncated -->`;
}

/** Redact secrets from free-form log / export text lines. */
export function redactDiagnosticText(text: string): string {
  let out = text;
  const patterns = [
    /Bearer\s+[A-Za-z0-9._-]+/gi,
    /access[_-]?token["']?\s*[:=]\s*["'][^"']+["']/gi,
    /refresh[_-]?token["']?\s*[:=]\s*["'][^"']+["']/gi,
    /("?(?:cookie|authorization|password|secret|credential)"?\s*:\s*)"[^"]*"/gi,
    /ya29\.[A-Za-z0-9._-]+/g,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}
