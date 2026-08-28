import { useT } from '../../i18n';
import type { DashboardActionItem } from './resolve-dashboard-actions';
import type { ProjectDto } from '@shared/schemas/import';

export interface DashboardSummaryStripProps {
  projects: ProjectDto[];
  actions: DashboardActionItem[];
}

export function DashboardSummaryStrip({ projects, actions }: DashboardSummaryStripProps) {
  const t = useT();

  const active = projects.filter((p) => p.status !== 'archived');
  if (active.length === 0) return null;

  const translated = active.reduce((sum, p) => sum + (p.translatedChapterCount ?? 0), 0);
  const source = active.reduce((sum, p) => sum + (p.sourceChapterCount ?? 0), 0);
  const actionCount = actions.filter(
    (a) => a.severity === 'ERROR' || a.severity === 'ACTION_REQUIRED',
  ).length;

  return (
    <p className="dashboard-summary-strip muted" aria-label={t('dashboard.summaryLabel')}>
      {t('dashboard.summaryProjects', { count: active.length })}
      {' · '}
      {t('dashboard.summaryProgress', { done: translated, total: source })}
      {' · '}
      {t('dashboard.summaryActions', { count: actionCount })}
    </p>
  );
}
