import { describe, expect, it } from 'vitest';
import { formatKhepreePlanPrice, pickDefaultUpgradePlan } from '@renderer/features/khepree/khepree-plan-format';
import type { KhepreePlanCatalogItem } from '@shared/schemas/khepree-api';

const samplePlans: KhepreePlanCatalogItem[] = [
  {
    planId: 'starter-90d',
    planName: 'Starter',
    price: 99_000,
    currency: 'VND',
    accessTerm: '90 days',
    featureSummary: ['Translation'],
    isCurrent: false,
    isUpgradeAvailable: true,
  },
  {
    planId: 'pro-90d',
    planName: 'Pro',
    price: 199_000,
    currency: 'VND',
    accessTerm: '90 days',
    featureSummary: ['Translation', 'Export'],
    isCurrent: true,
    isUpgradeAvailable: false,
  },
];

describe('khepree plan format', () => {
  it('formats price from API currency without inventing monthly label', () => {
    const text = formatKhepreePlanPrice(samplePlans[0], 'vi-VN');
    expect(text).toMatch(/99/);
    expect(text.toLowerCase()).not.toContain('month');
  });

  it('picks first upgradeable non-current plan', () => {
    expect(pickDefaultUpgradePlan(samplePlans)?.planId).toBe('starter-90d');
  });
});
