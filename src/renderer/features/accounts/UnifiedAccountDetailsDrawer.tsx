import { Drawer } from '../../components/ui/Drawer';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { formatExactTimestamp } from './format-relative-time';
import type { AiAccountViewModel } from './ai-account-view-model';

export interface UnifiedAccountDetailsDrawerProps {
  account: AiAccountViewModel | null;
  showAdvanced: boolean;
  onClose: () => void;
  onCopyPath: (path: string) => void;
}

export function UnifiedAccountDetailsDrawer({
  account,
  showAdvanced,
  onClose,
  onCopyPath,
}: UnifiedAccountDetailsDrawerProps) {
  const t = useT();

  return (
    <Drawer open={account !== null} title={t('accounts.menuDetails')} onClose={onClose}>
      {account ? (
        <dl className="account-details-dl">
          <div>
            <dt>{t('accounts.detailProvider')}</dt>
            <dd>{t(account.providerLabelKey)}</dd>
          </div>
          <div>
            <dt>{t('accounts.detailStatus')}</dt>
            <dd>{statusLabel(account.rawStatus)}</dd>
          </div>
          {account.email ? (
            <div>
              <dt>{t('accounts.editEmailReadonly')}</dt>
              <dd>{account.email}</dd>
            </div>
          ) : null}
          {account.lastUsedAt ? (
            <div>
              <dt>{t('accounts.lastUsed')}</dt>
              <dd>{formatExactTimestamp(account.lastUsedAt)}</dd>
            </div>
          ) : null}
          {account.activeJob?.projectName ? (
            <div>
              <dt>{t('accounts.currentWorkLabel')}</dt>
              <dd>{account.activeJob.projectName}</dd>
            </div>
          ) : null}
          {account.lastError ? (
            <div>
              <dt>{t('accounts.detailLastError')}</dt>
              <dd>{account.lastError}</dd>
            </div>
          ) : null}

          {showAdvanced ? (
            <>
              <h4 className="account-details-advanced-title">{t('accounts.advancedSection')}</h4>
              <div>
                <dt>{t('accounts.detailAccountId')}</dt>
                <dd><code>{account.id}</code></dd>
              </div>
              {account.profileDir ? (
                <div>
                  <dt>{t('accounts.browserProfile')}</dt>
                  <dd>
                    <code className="account-path-code">{account.profileDir}</code>
                    <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onCopyPath(account.profileDir!);
                        }}
                      >
                        {t('actions.copy')}
                      </Button>
                    </div>
                  </dd>
                </div>
              ) : null}
              {account.source.kind === 'google' && account.source.account.profileLease ? (
                <>
                  <div>
                    <dt>{t('accounts.detailLeaseOperation')}</dt>
                    <dd>{account.source.account.profileLease.operation}</dd>
                  </div>
                  <div>
                    <dt>{t('accounts.detailLeasePid')}</dt>
                    <dd>{account.source.account.profileLease.pid}</dd>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </dl>
      ) : null}
    </Drawer>
  );
}
