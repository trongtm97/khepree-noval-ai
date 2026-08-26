import type { Locator, Page } from 'playwright';
import type { SelectorStrategyOverride } from '@shared/schemas/selector-override';

/** Built-in strategies may use RegExp; overrides are string-only. */
export type SelectorStrategy =
  | { kind: 'testId'; testId: string }
  | { kind: 'role'; role: Parameters<Page['getByRole']>[0]; name?: string | RegExp }
  | { kind: 'label'; label: string | RegExp }
  | { kind: 'placeholder'; placeholder: string | RegExp }
  | { kind: 'text'; text: string | RegExp }
  | { kind: 'css'; css: string };

export function describeStrategy(strategy: SelectorStrategy): string {
  switch (strategy.kind) {
    case 'testId':
      return `testId=${strategy.testId}`;
    case 'role':
      return `role=${strategy.role}${strategy.name ? ` name=${String(strategy.name)}` : ''}`;
    case 'label':
      return `label=${String(strategy.label)}`;
    case 'placeholder':
      return `placeholder=${String(strategy.placeholder)}`;
    case 'text':
      return `text=${String(strategy.text)}`;
    case 'css':
      return `css=${strategy.css}`;
    default: {
      const _exhaustive: never = strategy;
      return String(_exhaustive);
    }
  }
}

export function overrideToStrategy(override: SelectorStrategyOverride): SelectorStrategy {
  switch (override.kind) {
    case 'testId':
      return { kind: 'testId', testId: override.testId };
    case 'role':
      return {
        kind: 'role',
        role: override.role as Parameters<Page['getByRole']>[0],
        name: override.name,
      };
    case 'label':
      return { kind: 'label', label: override.label };
    case 'placeholder':
      return { kind: 'placeholder', placeholder: override.placeholder };
    case 'text':
      return { kind: 'text', text: override.text };
    case 'css':
      return { kind: 'css', css: override.css };
    default: {
      const _exhaustive: never = override;
      return _exhaustive;
    }
  }
}

export function locatorFromStrategy(page: Page, strategy: SelectorStrategy): Locator {
  switch (strategy.kind) {
    case 'testId':
      return page.getByTestId(strategy.testId);
    case 'role':
      return strategy.name
        ? page.getByRole(strategy.role, { name: strategy.name })
        : page.getByRole(strategy.role);
    case 'label':
      return page.getByLabel(strategy.label);
    case 'placeholder':
      return page.getByPlaceholder(strategy.placeholder);
    case 'text':
      return page.getByText(strategy.text);
    case 'css':
      return page.locator(strategy.css);
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

export function mergeStrategies(
  builtin: SelectorStrategy[],
  overrides: SelectorStrategyOverride[] | undefined,
  mode: 'prepend' | 'append' | 'replace' = 'prepend',
): SelectorStrategy[] {
  if (!overrides || overrides.length === 0) {
    return builtin;
  }
  const mapped = overrides.map(overrideToStrategy);
  if (mode === 'replace') return mapped;
  if (mode === 'append') return [...builtin, ...mapped];
  return [...mapped, ...builtin];
}
