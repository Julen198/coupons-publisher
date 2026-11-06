// Which public URLs exist, decided before the page renders (see src/proxy.ts): pure, so it tests without a database.
import { isPublic, statusOf } from "./coupon-status.ts";
import { isSpanishMarket } from "./market.ts";
import { dealPath, parseDealId } from "./site-text.ts";

export type DealVisibility = "live" | "expired" | "gone";

export type VisibilityFields = {
  verified: number;
  archived: number;
  expires_at: string;
  source: string;
  review: string;
  store_website: string;
};

// live: shown everywhere. expired: once public, its page stays up marked as expired.
// gone: archived, pending, never-checked web finds and other markets have no page.
export function dealVisibility(c: VisibilityFields, today: string, unverified: boolean): DealVisibility {
  if (!isSpanishMarket(c.store_website)) return "gone";
  if (isPublic(c, today, unverified)) return "live";
  const wasPublic = statusOf(c, today) === "expired" && (unverified || c.source !== "web" || c.verified);
  return wasPublic ? "expired" : "gone";
}

export type RouteVerdict = { kind: "ok" } | { kind: "missing" } | { kind: "moved"; to: string };

export type DealRouteRow = VisibilityFields & { id: number; title: string; store_name: string };

// /chollos/<param>: missing when there is no page for it, moved when the words after the id are not the canonical ones
export function dealRouteVerdict(param: string, row: DealRouteRow | undefined, today: string, unverified: boolean): RouteVerdict {
  const id = parseDealId(param);
  if (!id || !row || row.id !== id || dealVisibility(row, today, unverified) === "gone") return { kind: "missing" };
  const canonical = dealPath(row);
  return `/chollos/${param}` === canonical ? { kind: "ok" } : { kind: "moved", to: canonical };
}

// /tiendas/<slug>: the store exists and belongs to the Spanish market
export function storeRouteVerdict(row: { website: string } | undefined): RouteVerdict {
  return row && isSpanishMarket(row.website) ? { kind: "ok" } : { kind: "missing" };
}
