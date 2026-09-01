import { useState } from 'react';
import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { useKhepreePlanCatalog } from '../useKhepreePlanCatalog';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';
import { formatKhepreeEntitlement, formatKhepreeRenewalLine } from '../khepree-display';
import { KhepreePlanCatalog } from '../KhepreePlanCatalog';
import { KhepreeCheckoutWaiting } from '../KhepreeCheckoutWaiting';
import { KHEPREE_PRODUCT_CODE } from '@shared/constants/khepree';

export function KhepreePlanPage() {
  const t = useT();
  const { state } = useKhepreeAccessState();
  const { plans, loading, error, reload } = useKhepreePlanCatalog(Boolean(state?.signedIn));
  const [busy, setBusy] = useState(false);
  const renewal = state ? formatKhepreeRenewalLine(t, state) : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const startUpgrade = (planId: string) =>
    run(async () => {
      await window.novelTrans.khepree.startCheckout({ planId });
    });

  const checkoutActive =
    state?.checkoutPhase === 'waiting' ||
    state?.checkoutPhase === 'confirming' ||
    state?.checkoutPhase === 'timeout';

  return (
    <Card className="khepree-panel">
      <h2>{t('khepree.plan.title')}</h2>
      {!state?.signedIn ? (
        <p>{t('khepree.plan.signInRequired')}</p>
      ) : checkoutActive && state ? (
        <KhepreeCheckoutWaiting
          state={state}
          busy={busy}
          onCheck={() => run(() => window.novelTrans.khepree.checkCheckout())}
          onCancel={() => run(() => window.novelTrans.khepree.cancelCheckout())}
          onReopen={() => run(() => window.novelTrans.khepree.reopenCheckout())}
        />
      ) : (
        <>
          <p className="setup-wizard__hint">{t('khepree.plans.productInfo', { id: KHEPREE_PRODUCT_CODE })}</p>
          <dl className="khepree-dl">
            <div>
              <dt>{t('khepree.plan.current')}</dt>
              <dd>{state.plan?.planName ?? t('khepree.menu.noPlan')}</dd>
            </div>
            <div>
              <dt>{t('khepree.plan.status')}</dt>
              <dd>{formatKhepreeEntitlement(t, state.entitlement)}</dd>
            </div>
            {state.billing !== 'none' ? (
              <div>
                <dt>{t('khepree.plan.billingStatus')}</dt>
                <dd>{t(`khepree.billing.${state.billing}`)}</dd>
              </div>
            ) : null}
            {renewal ? (
              <div>
                <dt>{t('khepree.account.renewal')}</dt>
                <dd>{renewal}</dd>
              </div>
            ) : null}
          </dl>

          <h3>{t('khepree.plans.availableTitle')}</h3>
          {loading ? <p className="setup-wizard__hint">{t('khepree.plans.loading')}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !error ? (
            <KhepreePlanCatalog plans={plans} busy={busy} onUpgrade={startUpgrade} />
          ) : null}
        </>
      )}
      <div className="khepree-gate__actions">
        <Button type="button" variant="secondary" onClick={() => openKhepreeExternal('productHub')}>
          {t('khepree.plan.viewProductHub')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => openKhepreeExternal('plans')}>
          {t('khepree.plan.viewPlans')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void reload()}>
          {t('khepree.entitlement.refresh')}
        </Button>
      </div>
    </Card>
  );
}
