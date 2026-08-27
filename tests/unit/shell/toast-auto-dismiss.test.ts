import { describe, expect, it } from 'vitest';
import { shouldAutoDismissToast } from '../../../src/renderer/stores/notification-store';

describe('shouldAutoDismissToast', () => {
  it('keeps ACTION_REQUIRED visible until the user acts', () => {
    expect(shouldAutoDismissToast('ACTION_REQUIRED')).toBe(false);
  });

  it('auto-hides informational toasts', () => {
    expect(shouldAutoDismissToast('SUCCESS')).toBe(true);
    expect(shouldAutoDismissToast('INFO')).toBe(true);
    expect(shouldAutoDismissToast('WARNING')).toBe(true);
    expect(shouldAutoDismissToast('ERROR')).toBe(true);
  });
});
