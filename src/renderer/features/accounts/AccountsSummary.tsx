import { useT } from '../../i18n';
import type { AccountSummaryCounts } from './account-ui-state';

export interface AccountsSummaryProps {
  counts: AccountSummaryCounts;
}

export function AccountsSummary({ counts }: AccountsSummaryProps) {
  const t = useT();

  return (
    <div className="accounts-summary" role="status" aria-label={t('accounts.summaryLabel')}>
      <div className="accounts-summary-item accounts-summary-item--ready">
        <span className="accounts-summary-value">{counts.ready}</span>
        <span className="accounts-summary-label">{t('accounts.summaryReady')}</span>
      </div>
      <div className="accounts-summary-item accounts-summary-item--busy">
        <span className="accounts-summary-value">{counts.busy}</span>
        <span className="accounts-summary-label">{t('accounts.summaryBusy')}</span>
      </div>
      <div className="accounts-summary-item accounts-summary-item--paused">
        <span className="accounts-summary-value">{counts.paused}</span>
        <span className="accounts-summary-label">{t('accounts.summaryPaused')}</span>
      </div>
      <div className="accounts-summary-item accounts-summary-item--attention">
        <span className="accounts-summary-value">{counts.needsAttention}</span>
        <span className="accounts-summary-label">{t('accounts.summaryNeedsAttention')}</span>
      </div>
    </div>
  );
}
