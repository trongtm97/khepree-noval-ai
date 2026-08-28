import type { GoogleAccountDto } from '@shared/schemas/account';
import { Drawer } from '../../components/ui/Drawer';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import { statusLabel } from '../../i18n/status';
import { formatExactTimestamp } from './format-relative-time';

export interface AccountDetailsDrawerProps {
  account: GoogleAccountDto | null;
  showAdvanced: boolean;
  onClose: () => void;
  onCopyPath: (path: string) => void;
}

export function AccountDetailsDrawer({
  account,
  showAdvanced,
  onClose,
  onCopyPath,
}: AccountDetailsDrawerProps) {
  const t = useT();

  return (
    <Drawer open={account !== null} title={t('accounts.menuDetails')} onClose={onClose}>
      {account ? (
        <dl className="account-details-dl">
          <div>
            <dt>{t('accounts.detailAccountId')}</dt>
            <dd><code>{account.id}</code></dd>
          </div>
          {account.email ? (
            <div>
              <dt>{t('accounts.editEmailReadonly')}</dt>
              <dd>{account.email}</dd>
            </div>
          ) : null}
          {account.notes ? (
            <div>
              <dt>{t('accounts.menuNotes')}</dt>
              <dd>{account.notes}</dd>
            </div>
          ) : null}
          {account.assignedProjects.length > 0 ? (
            <div>
              <dt>{t('accounts.assignedProjects')}</dt>
              <dd>{account.assignedProjects.join(', ')}</dd>
            </div>
          ) : null}
          {account.lastUsedAt ? (
            <div>
              <dt>{t('accounts.lastUsed')}</dt>
              <dd>{formatExactTimestamp(account.lastUsedAt)}</dd>
            </div>
          ) : null}
          {account.lastSeenAt ? (
            <div>
              <dt>{t('accounts.detailLastSeen')}</dt>
              <dd>{formatExactTimestamp(account.lastSeenAt)}</dd>
            </div>
          ) : null}

          {showAdvanced ? (
            <>
              <h4 className="account-details-advanced-title">{t('accounts.advancedSection')}</h4>
              <div>
                <dt>{t('accounts.browserProfile')}</dt>
                <dd>
                  <code className="account-path-code">{account.browserProfilePath}</code>
                  <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { onCopyPath(account.browserProfilePath); }}
                    >
                      {t('actions.copy')}
                    </Button>
                  </div>
                </dd>
              </div>
              <div>
                <dt>{t('accounts.detailStatusEnum')}</dt>
                <dd>{statusLabel(account.status)}</dd>
              </div>
              <div>
                <dt>{t('accounts.workerState')}</dt>
                <dd>{account.workerEnabled ? t('accounts.ready') : t('status.paused')}</dd>
              </div>
              {account.profileLease ? (
                <>
                  <div>
                    <dt>{t('accounts.detailLeaseOperation')}</dt>
                    <dd>{account.profileLease.operation}</dd>
                  </div>
                  <div>
                    <dt>{t('accounts.detailLeasePid')}</dt>
                    <dd>{account.profileLease.pid}</dd>
                  </div>
                  <div>
                    <dt>{t('accounts.detailLeaseExpires')}</dt>
                    <dd>{formatExactTimestamp(account.profileLease.expiresAt)}</dd>
                  </div>
                </>
              ) : null}
              {account.assignedProjectIds.length > 0 ? (
                <div>
                  <dt>{t('accounts.detailAssignedIds')}</dt>
                  <dd><code>{account.assignedProjectIds.join(', ')}</code></dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
      ) : null}
    </Drawer>
  );
}
