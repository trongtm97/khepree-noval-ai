import { useNavigate } from 'react-router-dom';
import { Button, Card, SectionHeader } from '../../components/ui';
import { useT } from '../../i18n';
import { useAiAccounts } from '../accounts/use-ai-accounts';

export function AiAccountSection() {
  const t = useT();
  const navigate = useNavigate();
  const { accounts, loading } = useAiAccounts(t('accounts.displayNameFallback'));

  const readyCount = accounts.filter((a) => a.statusLane === 'ready').length;

  return (
    <section aria-labelledby="jobs-accounts-heading">
      <SectionHeader id="jobs-accounts-heading" title={t('jobs.aiAccounts')} />
      {loading ? (
        <Card className="jobs-account-card">
          <p className="muted" style={{ margin: 0 }}>
            {t('common.loading')}
          </p>
        </Card>
      ) : accounts.length === 0 ? (
        <Card className="jobs-account-card jobs-account-card--empty">
          <p className="muted" style={{ margin: 0 }}>
            {t('jobs.noWorkersHint')}
          </p>
          <Button
            size="sm"
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              navigate('/accounts');
            }}
          >
            {t('settings.aiManageAccounts')}
          </Button>
        </Card>
      ) : (
        <div className="jobs-account-grid">
          {accounts.map((account) => (
            <Card
              key={`${account.providerKind}-${account.id}`}
              className={`jobs-account-card jobs-account-card--${account.statusLane}`}
            >
              <div className="jobs-card-main">
                <strong>{account.displayName}</strong>
                <p className="muted u-text-sm" style={{ margin: '0.15rem 0 0' }}>
                  {t(account.providerLabelKey)}
                </p>
                <p className={`jobs-account-status jobs-account-status--${account.statusLane}`}>
                  <span className="jobs-summary-icon" aria-hidden>
                    {account.statusLane === 'attention' || account.statusLane === 'login'
                      ? '⚠'
                      : account.statusLane === 'paused'
                        ? '○'
                        : '●'}
                  </span>
                  <span>{t(`jobs.accountStatus.${account.statusLane}`)}</span>
                </p>
                {account.activeJob ? (
                  <p className="muted u-text-sm" style={{ margin: '0.35rem 0 0' }}>
                    {t('jobs.accountStatusRunning', {
                      project: account.activeJob.projectName ?? account.activeJob.projectId,
                    })}
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      {accounts.length > 0 ? (
        <p className="muted u-text-sm" style={{ marginTop: '0.5rem' }}>
          {t('jobs.aiAccountsSummary', {
            ready: String(readyCount),
            total: String(accounts.length),
          })}
        </p>
      ) : null}
    </section>
  );
}
