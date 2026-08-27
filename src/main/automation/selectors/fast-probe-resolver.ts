import type { Locator, Page } from 'playwright';
import {
  describeStrategy,
  locatorFromStrategy,
  type SelectorStrategy,
} from './selector-strategy';

export interface ProbeResolveOptions {
  page: Page;
  strategies: SelectorStrategy[];
  /** Total budget across all probes (not per-strategy × N). */
  timeoutMs?: number;
  /** Per-strategy probe window (100–300ms). */
  probeMs?: number;
  visible?: boolean;
  editable?: boolean;
  /** Optional scope root — composer/messages must live inside. */
  scope?: Locator | null;
  validateCandidate?: (locator: Locator) => Promise<boolean>;
}

export interface ProbeWinner {
  locator: Locator;
  strategy: SelectorStrategy;
  strategyId: string;
  score: number;
  durationMs: number;
  fallbackDepth: number;
}

export interface ProbeFailure {
  tried: string[];
  durationMs: number;
}

const BANNED_SOLE_CSS = new Set([
  'h1',
  'button',
  '[contenteditable=true]',
  '[contenteditable="true"]',
  "[contenteditable='true']",
]);

function kindBaseScore(strategy: SelectorStrategy): number {
  switch (strategy.kind) {
    case 'testId':
      return 100;
    case 'role':
      return strategy.name ? 95 : 40;
    case 'label':
      return 90;
    case 'placeholder':
      return 85;
    case 'text':
      return 45;
    case 'css':
      return BANNED_SOLE_CSS.has(strategy.css.trim().toLowerCase()) ? -100 : 25;
    default:
      return 0;
  }
}

function clampProbeMs(ms: number): number {
  return Math.min(300, Math.max(100, ms));
}

/**
 * Fast multi-strategy probe: short timeout per strategy, score candidates, validate winner.
 * Does NOT wait 2.5s × N strategies sequentially.
 */
export async function fastProbeResolve(
  options: ProbeResolveOptions,
): Promise<ProbeWinner | ProbeFailure> {
  const started = Date.now();
  const probeMs = clampProbeMs(options.probeMs ?? 200);
  const budget = options.timeoutMs ?? 2_500;
  const requireVisible = options.visible !== false;
  const tried: string[] = [];
  let best: ProbeWinner | null = null;

  for (let depth = 0; depth < options.strategies.length; depth++) {
    if (Date.now() - started >= budget) break;

    const strategy = options.strategies[depth];
    const strategyId = describeStrategy(strategy);
    tried.push(strategyId);

    if (strategy.kind === 'css' && BANNED_SOLE_CSS.has(strategy.css.trim().toLowerCase())) {
      continue;
    }

    const remaining = budget - (Date.now() - started);
    const thisProbe = Math.min(probeMs, Math.max(50, remaining));

    const locator =
      options.scope != null
        ? scopedLocator(options.scope, strategy, options.page)
        : locatorFromStrategy(options.page, strategy);

    let count = 0;
    try {
      count = await locator.count();
    } catch {
      continue;
    }

    if (count === 0) {
      // Brief attach wait — not full timeoutMs.
      try {
        await locator.first().waitFor({
          state: requireVisible ? 'visible' : 'attached',
          timeout: thisProbe,
        });
        count = Math.max(await locator.count().catch(() => 1), 1);
      } catch {
        continue;
      }
    }

    for (let i = 0; i < Math.min(count, 8); i++) {
      const candidate = locator.nth(i);
      try {
        const stateOk = requireVisible
          ? await candidate.isVisible().catch(() => false)
          : (await candidate.count().catch(() => 0)) > 0;
        if (!stateOk) continue;

        if (options.editable) {
          const editable = await isEditableComposerLocator(candidate);
          if (!editable) continue;
        }

        if (options.validateCandidate) {
          const ok = await options.validateCandidate(candidate);
          if (!ok) continue;
        }

        let score = kindBaseScore(strategy);
        if (count === 1) score += 10;
        if (options.scope) score += 15;
        if (options.editable) score += 5;
        // Prefer earlier strategies slightly when scores tie
        score += Math.max(0, 5 - Math.min(depth, 5));

        if (!best || score > best.score) {
          best = {
            locator: candidate,
            strategy,
            strategyId,
            score,
            durationMs: Date.now() - started,
            fallbackDepth: depth,
          };
        }
      } catch {
        // next candidate
      }
    }

    // Good accessible unique hit — stop early
    if (best && best.score >= 100 && best.fallbackDepth === depth && count === 1) {
      break;
    }
  }

  if (best && best.score > 0) {
    return { ...best, durationMs: Date.now() - started };
  }

  return { tried, durationMs: Date.now() - started };
}

function scopedLocator(scope: Locator, strategy: SelectorStrategy, page: Page): Locator {
  switch (strategy.kind) {
    case 'testId':
      return scope.getByTestId(strategy.testId);
    case 'role':
      return strategy.name
        ? scope.getByRole(strategy.role, { name: strategy.name })
        : scope.getByRole(strategy.role);
    case 'label':
      return scope.getByLabel(strategy.label);
    case 'placeholder':
      return scope.getByPlaceholder(strategy.placeholder);
    case 'text':
      return scope.getByText(strategy.text);
    case 'css':
      return scope.locator(strategy.css);
    default: {
      void page;
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

export async function isEditableComposerLocator(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((el) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        if (el.disabled || el.readOnly) return false;
        const name = (el.getAttribute('formcontrolname') ?? '').toLowerCase();
        if (name === 'discoversourcesquery') return false;
        const aria = (el.getAttribute('aria-label') ?? '').toLowerCase();
        if (aria.includes('khám phá nguồn') || aria.includes('discover source')) return false;
        return true;
      }
      if (el instanceof HTMLElement && el.isContentEditable) return true;
      const role = el.getAttribute('role');
      return role === 'textbox' || role === 'searchbox';
    })
    .catch(() => false);
}

export function isProbeWinner(result: ProbeWinner | ProbeFailure): result is ProbeWinner {
  return 'locator' in result && 'strategyId' in result;
}
