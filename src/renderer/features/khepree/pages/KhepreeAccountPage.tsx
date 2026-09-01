import { useNavigate } from 'react-router-dom';
import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';
import {
  formatKhepreeAccessStatus,
  formatKhepreeEntitlement,
  formatKhepreeRenewalLine,
  maskKhepreeEmail,
} from '../khepree-display';
import { KHEPREE_PRODUCT_CODE } from '@shared/constants/khepree';

export function KhepreeAccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const { state } = useKhepreeAccessState();
  const renewal = state ? formatKhepreeRenewalLine(t, state) : null;

  return (
    <Card className="khepree-panel">
      <h2>{t('khepree.account.title')}</h2>
      {!state?.signedIn ? (
        <>
          <p>{t('khepree.account.notSignedIn')}</p>
          <Button type="button" variant="primary" onClick={() => void window.novelTrans.khepree.startLogin()}>
            {t('khepree.login.action')}
          </Button>
        </>
      ) : (
        <>
          <dl className="khepree-dl">
            <div>
              <dt>{t('khepree.account.name')}</dt>
              <dd>{state.user?.displayName ?? t('khepree.account.nameUnknown')}</dd>
            </div>
            <div>
              <dt>{t('khepree.account.email')}</dt>
              <dd>{state.user?.email ? maskKhepreeEmail(state.user.email) : '—'}</dd>
            </div>
            <div>
              <dt>{t('khepree.account.product')}</dt>
              <dd>{t('khepree.account.productName', { id: KHEPREE_PRODUCT_CODE })}</dd>
            </div>
            <div>
              <dt>{t('khepree.account.plan')}</dt>
              <dd>{state.plan?.planName ?? t('khepree.menu.noPlan')}</dd>
            </div>
            <div>
              <dt>{t('khepree.account.accessStatus')}</dt>
              <dd>{formatKhepreeAccessStatus(t, state.status)}</dd>
            </div>
            <div>
              <dt>{t('khepree.account.entitlement')}</dt>
              <dd>{formatKhepreeEntitlement(t, state.entitlement)}</dd>
            </div>
            {renewal ? (
              <div>
                <dt>{t('khepree.account.renewal')}</dt>
                <dd>{renewal}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('khepree.account.devices')}</dt>
              <dd>
                {t('khepree.account.devicesCount', {
                  used: state.devicesUsed ?? '?',
                  max: state.devicesMax ?? '?',
                })}
              </dd>
            </div>
          </dl>

          <div className="khepree-gate__actions">
            <Button type="button" variant="secondary" onClick={() => openKhepreeExternal('devices')}>
              {t('khepree.account.manageDevices')}
            </Button>
            <Button type="button" variant="primary" onClick={() => navigate('/khepree/plan')}>
              {t('khepree.account.upgradePlan')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => openKhepreeExternal('account')}>
              {t('khepree.account.openAccount')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void window.novelTrans.khepree.signOut()}>
              {t('khepree.account.signOut')}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
