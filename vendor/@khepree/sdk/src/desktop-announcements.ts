export const DESKTOP_ANNOUNCEMENT_SEVERITIES = [
  "info",
  "success",
  "warning",
  "error",
  "action_required",
] as const;

export type DesktopAnnouncementSeverity = (typeof DESKTOP_ANNOUNCEMENT_SEVERITIES)[number];

export const DESKTOP_ANNOUNCEMENT_CTA_KINDS = ["none", "open_url", "open_path"] as const;

export type DesktopAnnouncementCtaKind = (typeof DESKTOP_ANNOUNCEMENT_CTA_KINDS)[number];

/**
 * Desktop rendering lane. Old clients receive `undefined` and treat as `general`.
 * `general`  : standard notification panel
 * `whats_new`: What's New / release notes panel (not an urgent modal)
 * `urgent`   : elevated modal (only valid with error/action_required severity)
 */
export const DESKTOP_ANNOUNCEMENT_TYPES = ["general", "whats_new", "urgent"] as const;
export type DesktopAnnouncementType = (typeof DESKTOP_ANNOUNCEMENT_TYPES)[number];

export interface DesktopAnnouncementCta {
  kind: DesktopAnnouncementCtaKind;
  payload: Record<string, unknown> | null;
}

export interface DesktopAnnouncementItem {
  publicId: string;
  severity: DesktopAnnouncementSeverity;
  /** Desktop rendering lane. Absent in responses from old servers → treat as `general`. */
  type?: DesktopAnnouncementType;
  title: string;
  body: string | null;
  /** Locale-specific CTA button label. Absent = use platform default. */
  ctaLabel?: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  cta: DesktopAnnouncementCta;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface DesktopAnnouncementsResponse {
  items: DesktopAnnouncementItem[];
  nextCursor: string | null;
}

export interface DesktopAnnouncementReadResponse {
  publicId: string;
  readAt: string;
}

export interface DesktopAnnouncementDismissResponse {
  publicId: string;
  dismissedAt: string;
  readAt: string | null;
}
