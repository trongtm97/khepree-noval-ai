/** Relative time for account activity (vi-VN friendly). */
export function formatRelativeTime(
  iso: string | null | undefined,
  now = Date.now(),
  locale = 'vi-VN',
): { key: string; params?: Record<string, string> } | null {
  if (!iso) return null;
  const date = new Date(iso);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return null;

  const diffSec = Math.round((now - ts) / 1000);
  if (diffSec < 60) {
    return { key: 'accounts.relativeJustNow' };
  }
  if (diffSec < 3600) {
    return {
      key: 'accounts.relativeMinutesAgo',
      params: { count: String(Math.floor(diffSec / 60)) },
    };
  }
  if (diffSec < 86_400) {
    return {
      key: 'accounts.relativeHoursAgo',
      params: { count: String(Math.floor(diffSec / 3600)) },
    };
  }

  const nowDate = new Date(now);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (dayDiff === 1) {
    return { key: 'accounts.relativeYesterday' };
  }

  return {
    key: 'accounts.relativeDate',
    params: {
      date: date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    },
  };
}

export function formatExactTimestamp(
  iso: string | null | undefined,
  locale = 'vi-VN',
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
