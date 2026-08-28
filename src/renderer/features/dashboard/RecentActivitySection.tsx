import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { SectionHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { formatRelativeDate } from '../../utils/format-relative-date';
import type { DashboardActivityEvent } from './resolve-recent-activity';

export interface RecentActivitySectionProps {
  events: DashboardActivityEvent[];
}

export function RecentActivitySection({ events }: RecentActivitySectionProps) {
  const t = useT();
  const navigate = useNavigate();

  if (events.length === 0) return null;

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-activity-heading">
      <SectionHeader id="dashboard-activity-heading" title={t('dashboard.recentActivity')} />
      <ul className="dashboard-activity-list">
        {events.map((event) => {
          const relative = formatRelativeDate(event.timestamp);
          const when = relative.params
            ? t(relative.key, relative.params)
            : t(relative.key);
          const label = event.messageParams
            ? t(event.messageKey, event.messageParams)
            : t(event.messageKey);

          return (
            <li key={event.id}>
              <button
                type="button"
                className="dashboard-activity-item"
                onClick={() => {
                  navigate(event.route);
                }}
              >
                <History size={16} aria-hidden className="dashboard-activity-item__icon" />
                <span className="dashboard-activity-item__label">{label}</span>
                <span className="dashboard-activity-item__when muted">{when}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
