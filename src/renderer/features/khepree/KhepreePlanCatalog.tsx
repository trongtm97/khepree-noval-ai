import type { KhepreePlanCatalogItem } from '@shared/schemas/khepree-api';
import { useT, getResolvedUiLocale } from '../../i18n';
import { Button } from '../../components/ui';
import { formatKhepreePlanPrice } from './khepree-plan-format';

interface KhepreePlanCatalogProps {
  plans: KhepreePlanCatalogItem[];
  busy?: boolean;
  onUpgrade: (planId: string) => void;
}

export function KhepreePlanCatalog({ plans, busy = false, onUpgrade }: KhepreePlanCatalogProps) {
  const t = useT();
  const locale = getResolvedUiLocale();

  if (plans.length === 0) {
    return <p className="setup-wizard__hint">{t('khepree.plans.empty')}</p>;
  }

  return (
    <div className="khepree-plan-grid">
      {plans.map((plan) => (
        <article
          key={plan.planId}
          className={`khepree-plan-card${plan.isCurrent ? ' khepree-plan-card--current' : ''}`}
        >
          <header className="khepree-plan-card__header">
            <h3>{plan.planName}</h3>
            {plan.isCurrent ? (
              <span className="khepree-plan-card__badge">{t('khepree.plans.currentBadge')}</span>
            ) : null}
          </header>
          <p className="khepree-plan-card__price">{formatKhepreePlanPrice(plan, locale)}</p>
          <p className="khepree-plan-card__term">{plan.accessTerm}</p>
          {plan.featureSummary.length > 0 ? (
            <ul className="khepree-plan-card__features">
              {plan.featureSummary.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          ) : null}
          {plan.isUpgradeAvailable && !plan.isCurrent ? (
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => onUpgrade(plan.planId)}
            >
              {t('khepree.plans.upgradeAction')}
            </Button>
          ) : plan.isCurrent ? (
            <p className="setup-wizard__hint">{t('khepree.plans.currentHint')}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
