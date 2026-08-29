import type { JobDto } from '@shared/schemas/job';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import { countBulkEligible, type JobBulkAction } from './jobs-utils';

export interface JobsBulkBarProps {
  jobs: JobDto[];
  selectedJobIds: Set<string>;
  busy: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkAction: (action: JobBulkAction) => void;
}

export function JobsBulkBar({
  jobs,
  selectedJobIds,
  busy,
  onSelectAll,
  onClearSelection,
  onBulkAction,
}: JobsBulkBarProps) {
  const t = useT();
  const count = selectedJobIds.size;
  if (count === 0) return null;

  const cancelCount = countBulkEligible(jobs, selectedJobIds, 'cancel');
  const retryCount = countBulkEligible(jobs, selectedJobIds, 'retry');

  return (
    <div className="jobs-bulk-bar" role="region" aria-label={t('jobs.selectedCount', { n: String(count) })}>
      <span className="jobs-bulk-bar__count">
        {t('jobs.selectedCount', { n: String(count) })}
      </span>
      <div className="jobs-bulk-bar__actions btn-row">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onSelectAll}>
          {t('jobs.selectAll')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || cancelCount === 0}
          onClick={() => {
            onBulkAction('cancel');
          }}
        >
          {t('jobs.bulkCancel')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || retryCount === 0}
          onClick={() => {
            onBulkAction('retry');
          }}
        >
          {t('jobs.bulkRetry')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          className="translation-menu__danger"
          onClick={() => {
            onBulkAction('delete');
          }}
        >
          {t('jobs.bulkDelete')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClearSelection}>
          {t('jobs.clearSelection')}
        </Button>
      </div>
    </div>
  );
}
