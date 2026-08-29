import { describe, expect, it } from 'vitest';
import {
  resolveToastDurationMs,
  shouldAutoDismissToast,
} from '../../../src/renderer/stores/notification-store';

describe('shouldAutoDismissToast', () => {
  it('auto-hides every toast kind including ACTION_REQUIRED', () => {
    expect(shouldAutoDismissToast('ACTION_REQUIRED')).toBe(true);
    expect(shouldAutoDismissToast('SUCCESS')).toBe(true);
    expect(shouldAutoDismissToast('INFO')).toBe(true);
    expect(shouldAutoDismissToast('WARNING')).toBe(true);
    expect(shouldAutoDismissToast('ERROR')).toBe(true);
  });
});

describe('resolveToastDurationMs', () => {
  it('uses kind defaults when no override is set', () => {
    expect(resolveToastDurationMs('SUCCESS')).toBe(4_000);
    expect(resolveToastDurationMs('WARNING')).toBe(6_000);
    expect(resolveToastDurationMs('ERROR')).toBe(8_000);
    expect(resolveToastDurationMs('ACTION_REQUIRED')).toBe(12_000);
  });

  it('respects explicit toastDurationMs override', () => {
    expect(resolveToastDurationMs('SUCCESS', 2_000)).toBe(2_000);
    expect(resolveToastDurationMs('ACTION_REQUIRED', 15_000)).toBe(15_000);
  });
});
