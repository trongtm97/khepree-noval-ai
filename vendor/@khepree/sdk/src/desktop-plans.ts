export interface DesktopPurchasablePlan {
  planPublicId: string;
  pricePublicId: string;
  planSlug: string | null;
  name: string;
  priceAmount: number;
  currency: string;
  accessTermLabel: string;
  isCurrent: boolean;
  isUpgradeAvailable: boolean;
}

export interface DesktopPlansResponse {
  currentPlanId: string | null;
  plans: DesktopPurchasablePlan[];
}
