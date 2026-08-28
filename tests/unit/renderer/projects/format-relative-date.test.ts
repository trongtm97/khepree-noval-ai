import { describe, expect, it } from 'vitest';
import { formatRelativeDate } from '../../../../src/renderer/utils/format-relative-date';

const NOW = new Date('2026-08-28T18:00:00.000Z').getTime();

describe('formatRelativeDate', () => {
  it('returns just now for recent updates', () => {
    expect(formatRelativeDate('2026-08-28T17:59:30.000Z', NOW)).toEqual({
      key: 'projects.updatedJustNow',
    });
  });

  it('returns minutes ago', () => {
    expect(formatRelativeDate('2026-08-28T17:50:00.000Z', NOW)).toEqual({
      key: 'projects.updatedMinutesAgo',
      params: { count: '10' },
    });
  });

  it('returns formatted date for older entries', () => {
    const result = formatRelativeDate('2026-08-01T10:00:00.000Z', NOW);
    expect(result.key).toBe('projects.updatedDate');
    expect(result.params?.date).toBeTruthy();
  });
});
