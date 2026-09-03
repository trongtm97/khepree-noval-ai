import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../components/ui';
import { useT } from '../../i18n';
import { formatRelativeDate } from '../../utils/format-relative-date';
import type { RecentCompletionItem } from './resolve-dashboard-home';

export interface DashboardRecentCompletionsProps {
  items: RecentCompletionItem[];
}

export function DashboardRecentCompletions({
  items,
}: DashboardRecentCompletionsProps) {
  const t = useT();
  const navigate = useNavigate();

  const openResultsFolder = async () => {
    try {
      await window.khepreeNovelAI.portability.openDefaultExportDirectory();
    } catch {
      navigate('/settings');
    }
  };

  if (items.length === 0) {
    return (
      <section aria-labelledby="dashboard-recent-heading">
        <h2 id="dashboard-recent-heading" className="dashboard-section-title">
          {t('dashboard.recentCompletionsTitle')}
        </h2>
        <p className="muted">{t('dashboard.recentCompletionsEmpty')}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="dashboard-recent-heading">
      <div className="dashboard-section-head">
        <h2 id="dashboard-recent-heading" className="dashboard-section-title">
          {t('dashboard.recentCompletionsTitle')}
        </h2>
        <Button size="sm" variant="secondary" onClick={() => void openResultsFolder()}>
          {t('dashboard.openResultsFolder')}
        </Button>
      </div>
      <Card className="dashboard-home-card">
        <ul className="dashboard-recent-list">
          {items.map((item) => {
            const rel = formatRelativeDate(item.completedAt);
            const when = rel.params ? t(rel.key, rel.params) : t(rel.key);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="dashboard-recent-list__link"
                  onClick={() => {
                    navigate(`/projects/${item.projectId}/translate`);
                  }}
                >
                  <strong>{item.projectTitle}</strong>
                  <span className="muted">{when}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
