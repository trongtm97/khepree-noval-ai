/** Base feed URL for Electron autoUpdater — Squirrel appends `/RELEASES`. */
export function buildSquirrelFeedUrl(input: {
  apiBaseUrl: string;
  productSlug: string;
  architecture: "x64" | "arm64";
  channel?: "stable" | "beta" | "alpha";
  feedTicket?: string;
}): string {
  const channel = input.channel ?? "stable";
  const base = `${input.apiBaseUrl.replace(/\/$/, "")}/api/v1/squirrel/feed/${encodeURIComponent(input.productSlug)}/windows/${input.architecture}/${channel}`;
  if (!input.feedTicket) return base;
  const url = new URL(base);
  url.searchParams.set("ft", input.feedTicket);
  return url.toString();
}

export interface DesktopSquirrelFeedTicketResponse {
  feedBaseUrl: string;
  feedTicketExpiresAt: string;
}

export interface DesktopSquirrelFeedTicketRequest {
  clientId: string;
  architecture?: "x64" | "arm64";
  channel?: "stable" | "beta" | "alpha";
}
