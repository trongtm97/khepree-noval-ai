import type { KhepreePlanCatalogItem } from '@shared/schemas/khepree-api';

export function formatKhepreePlanPrice(plan: KhepreePlanCatalogItem, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: plan.currency,
      maximumFractionDigits: plan.currency === 'VND' ? 0 : 2,
    }).format(plan.price);
  } catch {
    return `${plan.price} ${plan.currency}`;
  }
}

export function pickDefaultUpgradePlan(plans: KhepreePlanCatalogItem[]): KhepreePlanCatalogItem | null {
  const upgradeable = plans.filter((plan) => plan.isUpgradeAvailable && !plan.isCurrent);
  if (upgradeable.length > 0) return upgradeable[0];
  return plans.find((plan) => !plan.isCurrent) ?? null;
}
