/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  migrateNotificationPersist,
  resolveToastDurationMs,
  shouldAutoDismissToast,
  useNotificationStore,
} from '../../../src/renderer/stores/notification-store';
import { ToastViewport } from '../../../src/renderer/components/shell/ToastViewport';

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

describe('notification store read vs toast dismiss', () => {
  beforeEach(() => {
    useNotificationStore.setState({ items: [] });
  });

  it('dismissToast hides toast but keeps unread', () => {
    useNotificationStore.getState().add({
      id: 'n-dismiss',
      kind: 'SUCCESS',
      title: 'Done',
      description: 'Export finished',
      toast: true,
    });

    useNotificationStore.getState().dismissToast('n-dismiss');
    const item = useNotificationStore.getState().items.find((i) => i.id === 'n-dismiss');
    expect(item?.toast).toBe(false);
    expect(item?.read).toBe(false);
  });

  it('markRead marks read and hides toast', () => {
    useNotificationStore.getState().add({
      id: 'n-read',
      kind: 'ERROR',
      title: 'Failed',
      description: 'Job error',
      toast: true,
    });

    useNotificationStore.getState().markRead('n-read');
    const item = useNotificationStore.getState().items.find((i) => i.id === 'n-read');
    expect(item?.read).toBe(true);
    expect(item?.toast).toBe(false);
  });

  it('markAllRead marks every item read and clears toasts', () => {
    useNotificationStore.getState().add({
      id: 'n-a',
      kind: 'INFO',
      title: 'One',
      description: 'First',
      toast: true,
    });
    useNotificationStore.getState().add({
      id: 'n-b',
      kind: 'ACTION_REQUIRED',
      title: 'Two',
      description: 'Needs action',
      toast: true,
    });

    useNotificationStore.getState().markAllRead();
    const items = useNotificationStore.getState().items;
    expect(items.every((i) => i.read)).toBe(true);
    expect(items.every((i) => i.toast === false)).toBe(true);
  });

  it('ACTION_REQUIRED stays in history after toast auto-dismiss', () => {
    useNotificationStore.getState().add({
      id: 'n-action',
      kind: 'ACTION_REQUIRED',
      title: 'Update required',
      description: 'Mandatory update',
      toast: true,
    });

    useNotificationStore.getState().dismissToast('n-action');
    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('ACTION_REQUIRED');
    expect(items[0]?.read).toBe(false);
    expect(items[0]?.toast).toBe(false);
  });
});

describe('migrateNotificationPersist', () => {
  it('hydrates legacy items missing read/toast without crash', () => {
    const migrated = migrateNotificationPersist(
      {
        items: [
          {
            id: 'legacy-1',
            kind: 'WARNING',
            title: 'Old',
            description: 'Persisted before toast flag',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      0,
    );

    expect(migrated.items).toHaveLength(1);
    expect(migrated.items[0]?.read).toBe(false);
    expect(migrated.items[0]?.toast).toBe(false);
  });

  it('drops non-array toastActions from persisted rows', () => {
    const migrated = migrateNotificationPersist(
      {
        items: [
          {
            id: 'bad-actions',
            kind: 'SUCCESS',
            title: 'Done',
            description: 'Export',
            timestamp: '2026-01-01T00:00:00.000Z',
            read: false,
            toast: true,
            toastActions: 'not-an-array' as unknown as [],
          },
        ],
      },
      1,
    );

    expect(migrated.items[0]?.toastActions).toBeUndefined();
  });
});

describe('ToastViewport auto-dismiss timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.setState({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls dismissToast after duration — read stays false', () => {
    useNotificationStore.getState().add({
      id: 'timer-toast',
      kind: 'SUCCESS',
      title: 'Saved',
      description: 'Settings saved',
      toast: true,
      toastDurationMs: 2_000,
    });

    render(
      <MemoryRouter>
        <ToastViewport />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    const item = useNotificationStore.getState().items.find((i) => i.id === 'timer-toast');
    expect(item?.toast).toBe(false);
    expect(item?.read).toBe(false);
  });
});
