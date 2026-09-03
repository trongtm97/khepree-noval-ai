import { useState } from 'react';
import { useT } from '../../../i18n';
import { useKhepreeAccessState } from '../useKhepreeAccessState';
import { useKhepreePlanCatalog } from '../useKhepreePlanCatalog';
import { Button, Card } from '../../../components/ui';
import { openKhepreeExternal } from '../khepree-external';
import {
  formatKhepreeAccessStatus,
  formatKhepreeDevicesCount,
  formatKhepreeEntitlement,
  formatKhepreeRenewalLine,
} from '../khepree-display';
import { KhepreePlanCatalog } from '../KhepreePlanCatalog';
import { KhepreeCheckoutWaiting } from '../KhepreeCheckoutWaiting';

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
      await window.khepreeNovelAI.khepree.startCheckout({ planId });
    });

  const checkoutActive =
    state?.checkoutPhase === 'waiting' ||
    state?.checkoutPhase === 'confirming' ||
    state?.checkoutPhase === 'timeout';

  return (
    <Card className="khepree-panel">
      {!state?.signedIn ? (
        <div className="khepree-panel__inner">
          <h2 className="khepree-panel__section-title">{t('khepree.plan.title')}</h2>
          <p>{t('khepree.plan.signInRequired')}</p>
        </div>
      ) : checkoutActive ? (
        <KhepreeCheckoutWaiting
          state={state}
          busy={busy}
          onCheck={() => run(() => window.khepreeNovelAI.khepree.checkCheckout())}
          onCancel={() => run(() => window.khepreeNovelAI.khepree.cancelCheckout())}
          onReopen={() => run(() => window.khepreeNovelAI.khepree.reopenCheckout())}
        />
      ) : (
        <>
          <div className="khepree-plan-summary">
            <div>
              <p className="khepree-eyebrow">{t('khepree.plan.current')}</p>
              <p className="khepree-plan-summary__name">
                {state.plan?.planName ?? formatKhepreeEntitlement(t, state.entitlement)}
              </p>
              <p className="khepree-plan-summary__access">
                {formatKhepreeAccessStatus(t, state.status)}
              </p>
              <dl className="khepree-plan-summary__meta">
                <div className="khepree-plan-summary__meta-row">
                  <dt>{t('khepree.account.renewal')}</dt>
                  <dd>{renewal ?? '—'}</dd>
                </div>
                <div className="khepree-plan-summary__meta-row">
                  <dt>{t('khepree.account.devices')}</dt>
                  <dd>
                    {formatKhepreeDevicesCount(t, state.devicesUsed, state.devicesMax)}
                  </dd>
                </div>
                {state.billing !== 'none' ? (
                  <div className="khepree-plan-summary__meta-row">
                    <dt>{t('khepree.plan.billingStatus')}</dt>
                    <dd>{t(`khepree.billing.${state.billing}`)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                openKhepreeExternal('plans');
              }}
            >
              {t('khepree.plan.managePlan')}
            </Button>
          </div>

          <div className="khepree-panel__inner khepree-panel__section">
            <h2 className="khepree-panel__section-title">{t('khepree.plans.availableTitle')}</h2>
            {loading ? <p className="setup-wizard__hint">{t('khepree.plans.loading')}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            {!loading && !error ? (
              <KhepreePlanCatalog plans={plans} busy={busy} onUpgrade={(planId) => { void startUpgrade(planId); }} />
            ) : null}
          </div>
        </>
      )}
      <div className="khepree-gate__actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            openKhepreeExternal('productHub');
          }}
        >
          {t('khepree.plan.viewProductHub')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            openKhepreeExternal('plans');
          }}
        >
          {t('khepree.plan.viewPlans')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void reload();
          }}
        >
          {t('khepree.entitlement.refresh')}
        </Button>
      </div>
    </Card>
  );
}
