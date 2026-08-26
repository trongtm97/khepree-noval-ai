import { describe, expect, it } from 'vitest';
import { shouldNotifyJobTransition } from '../../../src/renderer/utils/job-notify';

describe('shouldNotifyJobTransition', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');

  it('notifies when state changes to FAILED', () => {
    expect(
      shouldNotifyJobTransition('QUEUED', 'FAILED', '2026-08-24T11:59:00.000Z', now),
    ).toBe(true);
  });

  it('notifies first sight of recent NEEDS_ATTENTION', () => {
    expect(
      shouldNotifyJobTransition(
        undefined,
        'NEEDS_ATTENTION',
        '2026-08-24T11:59:30.000Z',
        now,
      ),
    ).toBe(true);
  });

  it('does not notify stale terminal job on first poll', () => {
    expect(
      shouldNotifyJobTransition(
        undefined,
        'FAILED',
        '2026-08-24T10:00:00.000Z',
        now,
      ),
    ).toBe(false);
  });

  it('does not notify unchanged QUEUED', () => {
    expect(
      shouldNotifyJobTransition('QUEUED', 'QUEUED', '2026-08-24T11:59:00.000Z', now),
    ).toBe(false);
  });
});
