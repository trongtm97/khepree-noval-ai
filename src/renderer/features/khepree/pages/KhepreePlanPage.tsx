import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';
import { formatKhepreeEntitlement, formatKhepreeRenewalLine } from '../khepree-display';

export function KhepreePlanPage() {
  const t = useT();
  const { state } = useKhepreeAccessState();
  const renewal = state ? formatKhepreeRenewalLine(t, state) : null;

  return (
    <Card className="khepree-panel">
      <h2>{t('khepree.plan.title')}</h2>
      {!state?.signedIn ? (
        <p>{t('khepree.plan.signInRequired')}</p>
      ) : (
        <>
          <dl className="khepree-dl">
            <div>
              <dt>{t('khepree.plan.current')}</dt>
              <dd>{state.plan?.planName ?? t('khepree.menu.noPlan')}</dd>
            </div>
            <div>
              <dt>{t('khepree.plan.status')}</dt>
              <dd>{formatKhepreeEntitlement(t, state.entitlement)}</dd>
            </div>
            {state.plan?.status ? (
              <div>
                <dt>{t('khepree.plan.billingStatus')}</dt>
                <dd>{t(`khepree.planStatus.${state.plan.status}`)}</dd>
              </div>
            ) : null}
            {renewal ? (
              <div>
                <dt>{t('khepree.account.renewal')}</dt>
                <dd>{renewal}</dd>
              </div>
            ) : null}
          </dl>
        </>
      )}
      <div className="khepree-gate__actions">
        <Button type="button" variant="primary" onClick={() => void window.novelTrans.khepree.startCheckout()}>
          {t('khepree.plan.upgrade')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => openKhepreeExternal('plans')}>
          {t('khepree.plan.viewPlans')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void window.novelTrans.khepree.refreshEntitlement()}>
          {t('khepree.entitlement.refresh')}
        </Button>
      </div>
    </Card>
  );
}
