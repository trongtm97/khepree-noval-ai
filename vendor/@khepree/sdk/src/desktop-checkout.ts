export const DESKTOP_CHECKOUT_STATUSES = [
  "PENDING",
  "PAID_PROCESSING_ACCESS",
  "ACCESS_ACTIVE",
  "FAILED",
  "CANCELLED",
] as const;

export type DesktopCheckoutStatus = (typeof DESKTOP_CHECKOUT_STATUSES)[number];

export interface DesktopPlanSummary {
  planPublicId: string | null;
  planSlug: string | null;
  name: string;
  billingType: string;
  accessTermDays: number | null;
  accessTermLabel: string;
}

export interface DesktopDeviceUsage {
  slotsUsed: number;
  slotsMax: number;
  manageDevicesUrl: string;
}

export interface DesktopAllowedActions {
  checkout: boolean;
  upgrade: boolean;
  manageDevices: boolean;
  refreshEntitlement: boolean;
}

export interface DesktopMeUrls {
  manageDevices: string;
  accountBilling: string;
  checkout?: string;
}

export interface DesktopMeProduct {
  productId: string;
  slug: string | null;
}

export interface DesktopCheckoutCreateRequest {
  clientId: string;
  planPublicId: string;
  pricePublicId: string;
  locale?: string;
}

export interface DesktopCheckoutCreateResponse {
  checkoutPublicId: string;
  handoffUrl: string;
  status: DesktopCheckoutStatus;
}

export interface DesktopCheckoutStatusResponse {
  checkoutPublicId: string;
  status: DesktopCheckoutStatus;
  orderStatus: string;
}
