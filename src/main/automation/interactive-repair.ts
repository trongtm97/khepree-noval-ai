import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import type { AutomationProviderId } from '@shared/constants/diagnostics';
import type { LocatorSuggestion } from '@shared/schemas/diagnostics';
import type { SelectorStrategyOverride } from '@shared/schemas/selector-override';

export interface InteractiveRepairSession {
  sessionId: string;
  accountId: string;
  providerId: AutomationProviderId;
  selectorKey: string;
  page: Page;
  suggestion: LocatorSuggestion | null;
  createdAt: string;
}

/**
 * Extract safe locator metadata from a user click.
 * Rejects password fields. Never captures field values.
 */
export async function waitForElementClick(
  page: Page,
  timeoutMs: number,
): Promise<LocatorSuggestion> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __ntsRepairClick?: unknown;
      __ntsRepairHandler?: ((ev: MouseEvent) => void) | null;
    };
    if (w.__ntsRepairHandler) {
      document.removeEventListener('click', w.__ntsRepairHandler, true);
    }
    w.__ntsRepairClick = null;
    const handler = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const el = ev.target as Element | null;
      if (!el || !(el instanceof Element)) return;
      w.__ntsRepairClick = serializeElement(el);
      document.removeEventListener('click', handler, true);
      w.__ntsRepairHandler = null;
    };
    w.__ntsRepairHandler = handler;
    document.addEventListener('click', handler, true);

    function serializeElement(el: Element) {
      const input = el instanceof HTMLInputElement ? el : null;
      const type = (input?.type ?? '').toLowerCase();
      const autocomplete = (input?.autocomplete ?? el.getAttribute('autocomplete') ?? '').toLowerCase();
      const nameAttr = (input?.name ?? el.getAttribute('name') ?? '').toLowerCase();
      const isPassword =
        type === 'password' ||
        autocomplete.includes('password') ||
        nameAttr.includes('password') ||
        el.getAttribute('data-password') === 'true';

      const role = el.getAttribute('role');
      const testId =
        el.getAttribute('data-testid') ??
        el.getAttribute('data-test-id') ??
        el.getAttribute('data-test');
      const ariaLabel = el.getAttribute('aria-label');
      const placeholder = el.getAttribute('placeholder');
      const id = el.id || null;
      const tagName = el.tagName.toLowerCase();
      const textSnippet = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) || null;

      let cssPath: string | null = null;
      const dataAction = el.getAttribute('data-action');
      if (testId) {
        cssPath = `[data-testid="${cssEscape(testId)}"]`;
      } else if (id && /^[a-zA-Z][\w-]*$/.test(id)) {
        cssPath = `#${id}`;
      } else if (dataAction) {
        cssPath = `[data-action="${cssEscape(dataAction)}"]`;
      }

      return {
        rejected: isPassword,
        rejectReason: isPassword ? 'password fields are not captured' : null,
        tagName,
        id,
        testId,
        role,
        name: ariaLabel,
        label: ariaLabel,
        placeholder,
        textSnippet: isPassword ? null : textSnippet,
        cssPath: isPassword ? null : cssPath,
      };
    }

    function cssEscape(value: string): string {
      return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await page.evaluate(() => {
      const w = window as unknown as { __ntsRepairClick?: unknown };
      return w.__ntsRepairClick ?? null;
    });
    if (raw) {
      const pageUrl = page.url();
      let pageTitle: string | null = null;
      try {
        pageTitle = await page.title();
      } catch {
        pageTitle = null;
      }
      return buildSuggestion(raw as Record<string, unknown>, pageUrl, pageTitle);
    }
    await page.waitForTimeout(150);
  }

  return {
    rejected: true,
    rejectReason: 'timed out waiting for click',
    tagName: null,
    suggestedStrategies: [],
    metadata: {
      id: null,
      testId: null,
      role: null,
      name: null,
      label: null,
      placeholder: null,
      textSnippet: null,
      cssPath: null,
    },
    pageUrl: page.url(),
    pageTitle: null,
  };
}

function buildSuggestion(
  raw: Record<string, unknown>,
  pageUrl: string | null,
  pageTitle: string | null,
): LocatorSuggestion {
  const rejected = Boolean(raw.rejected);
  const strategies: SelectorStrategyOverride[] = [];
  if (!rejected) {
    if (typeof raw.testId === 'string' && raw.testId) {
      strategies.push({ kind: 'testId', testId: raw.testId });
    }
    if (typeof raw.role === 'string' && raw.role) {
      strategies.push({
        kind: 'role',
        role: raw.role,
        name: typeof raw.name === 'string' ? raw.name : undefined,
      });
    }
    if (typeof raw.label === 'string' && raw.label) {
      strategies.push({ kind: 'label', label: raw.label });
    }
    if (typeof raw.placeholder === 'string' && raw.placeholder) {
      strategies.push({ kind: 'placeholder', placeholder: raw.placeholder });
    }
    if (typeof raw.textSnippet === 'string' && raw.textSnippet && raw.textSnippet.length <= 60) {
      strategies.push({ kind: 'text', text: raw.textSnippet });
    }
    if (typeof raw.cssPath === 'string' && raw.cssPath) {
      strategies.push({ kind: 'css', css: raw.cssPath });
    }
  }

  return {
    rejected,
    rejectReason: typeof raw.rejectReason === 'string' ? raw.rejectReason : null,
    tagName: typeof raw.tagName === 'string' ? raw.tagName : null,
    suggestedStrategies: strategies,
    metadata: {
      id: typeof raw.id === 'string' ? raw.id : null,
      testId: typeof raw.testId === 'string' ? raw.testId : null,
      role: typeof raw.role === 'string' ? raw.role : null,
      name: typeof raw.name === 'string' ? raw.name : null,
      label: typeof raw.label === 'string' ? raw.label : null,
      placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : null,
      textSnippet: typeof raw.textSnippet === 'string' ? raw.textSnippet : null,
      cssPath: typeof raw.cssPath === 'string' ? raw.cssPath : null,
    },
    pageUrl,
    pageTitle,
  };
}

export function createRepairSessionId(): string {
  return randomUUID();
}
