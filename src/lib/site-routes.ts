// Which public URLs exist, decided before the page renders (see src/proxy.ts): pure, so it tests without a database.
import { isPublic, statusOf } from "./coupon-status.ts";
import { onSpanishSite, type CountryStore } from "./market.ts";
import { dealPath, parseDealId } from "./site-text.ts";
import { categoryOf, categoryPath } from "./catalog.ts";
import { eventPageOf } from "./event-pages.ts";

export type DealVisibility = "live" | "expired" | "gone";

export type VisibilityFields = {
  verified: number;
  archived: number;
  expires_at: string;
  source: string;
  review: string;
  store_website: string;
  store_name?: string;
  store_slug?: string;
  store_country?: string; // "" or missing = unknown, see onSpanishSite
  store_country_source?: string;
  store_tracking_url?: string;
};

const storeOf = (c: VisibilityFields): CountryStore => ({
  name: c.store_name ?? "", slug: c.store_slug ?? "", website: c.store_website, country: c.store_country, country_source: c.store_country_source, tracking_url: c.store_tracking_url,
});

// live: shown everywhere. expired: once public, its page stays up marked as expired.
// gone: archived, pending, never-checked web finds, other markets and links we can't track (tracked = false, see
// trackedLinkOf) have no page.
export function dealVisibility(c: VisibilityFields, today: string, unverified: boolean, tracked = true): DealVisibility {
  if (!tracked || !onSpanishSite(storeOf(c))) return "gone";
  if (isPublic(c, today, unverified)) return "live";
  const wasPublic = statusOf(c, today) === "expired" && (unverified || c.source !== "web" || c.verified);
  return wasPublic ? "expired" : "gone";
}

export type RouteVerdict = { kind: "ok" } | { kind: "missing" } | { kind: "moved"; to: string };

export type DealRouteRow = VisibilityFields & { id: number; title: string; store_name: string };

// /chollos/<param>: missing when there is no page for it, moved when the words after the id are not the canonical ones
export function dealRouteVerdict(param: string, row: DealRouteRow | undefined, today: string, unverified: boolean, tracked = true): RouteVerdict {
  const id = parseDealId(param);
  if (!id || !row || row.id !== id || dealVisibility(row, today, unverified, tracked) === "gone") return { kind: "missing" };
  const canonical = dealPath(row);
  return `/chollos/${param}` === canonical ? { kind: "ok" } : { kind: "moved", to: canonical };
}

// /tiendas/<slug>: the store exists and belongs to the Spanish market
export function storeRouteVerdict(row: CountryStore | undefined): RouteVerdict {
  return row && onSpanishSite(row) ? { kind: "ok" } : { kind: "missing" };
}

// A browser loading the page itself, the only request whose status a crawler sees. Next 16 strips the router's Flight
// headers (rsc, next-router-prefetch) before Proxy, so RSC navigations and prefetches are told apart by their Accept:
// the router's fetch() sends */*, a document navigation asks for text/html. _rsc is checked too in case it survives.
export function isDocumentRequest(method: string, accept: string | null, url: URL): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (url.searchParams.has("_rsc")) return false;
  return (accept ?? "").toLowerCase().includes("text/html");
}

// Pages whose URLs come from a fixed list, decided without the database: /categorias/<slug> and /ofertas/<event> exist
// only for known slugs, and the old home-page category links (/?cat=moda, no search) moved to /categorias/moda
export function fixedRouteVerdict(pathname: string, search: URLSearchParams): RouteVerdict | null {
  const cat = /^\/categorias\/([^/]+)$/.exec(pathname);
  if (cat) return categoryOf(cat[1]) ? { kind: "ok" } : { kind: "missing" };
  const ev = /^\/ofertas\/([^/]+)$/.exec(pathname);
  if (ev) return eventPageOf(ev[1]) ? { kind: "ok" } : { kind: "missing" };
  // /ofertas/<event>/<store>: an unknown event is missing here; the store is looked up like /tiendas/<slug> (proxy)
  const evStore = /^\/ofertas\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (evStore && evStore[2] !== "opengraph-image" && !eventPageOf(evStore[1])) return { kind: "missing" };
  if (pathname === "/" && search.has("cat") && !search.get("q")) {
    const known = categoryOf(search.get("cat") ?? "");
    const rest = new URLSearchParams(search);
    rest.delete("cat");
    const qs = rest.toString();
    // an unknown ?cat= just shows every deal, as before
    return known ? { kind: "moved", to: `${categoryPath(known.slug)}${qs ? `?${qs}` : ""}` } : null;
  }
  return null;
}
