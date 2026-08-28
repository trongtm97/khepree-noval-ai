/** Relative / friendly date for project activity (vi-VN). */
export function formatRelativeDate(
  iso: string,
  now = Date.now(),
  locale = 'vi-VN',
): { key: string; params?: Record<string, string> } {
  const date = new Date(iso);
  const ts = date.getTime();
  if (Number.isNaN(ts)) {
    return { key: 'projects.updatedUnknown' };
  }

  const diffSec = Math.round((now - ts) / 1000);
  if (diffSec < 60) {
    return { key: 'projects.updatedJustNow' };
  }
  if (diffSec < 3600) {
    return {
      key: 'projects.updatedMinutesAgo',
      params: { count: String(Math.floor(diffSec / 60)) },
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

  if (dayDiff === 0) {
    return {
      key: 'projects.updatedToday',
      params: {
        time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      },
    };
  }
  if (dayDiff === 1) {
    return { key: 'projects.updatedYesterday' };
  }
  if (dayDiff < 7) {
    return {
      key: 'projects.updatedDaysAgo',
      params: { count: String(dayDiff) },
    };
  }

  return {
    key: 'projects.updatedDate',
    params: {
      date: date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    },
  };
}
