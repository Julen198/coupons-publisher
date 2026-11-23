// Which public URLs exist, decided before the page renders (see src/proxy.ts): pure, so it tests without a database.
import { isPublic, statusOf } from "./coupon-status.ts";
import { onSpanishSite, type CountryStore } from "./market.ts";
import { dealPath, parseDealId } from "./site-text.ts";
import { categoryOf, categoryPath } from "./catalog.ts";
import { eventPageOf } from "./event-pages.ts";
import { brandOf } from "./brands.ts";

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
  store_open?: boolean; // the store shows unchecked web finds and needs no tracked link right now (see open-stores.ts)
  created_at?: Date | string;
  score?: number;
  expiry_reports?: number;
};

const storeOf = (c: VisibilityFields): CountryStore => ({
  name: c.store_name ?? "", slug: c.store_slug ?? "", website: c.store_website, country: c.store_country, country_source: c.store_country_source, tracking_url: c.store_tracking_url,
});

// live: shown everywhere. expired: once public, its page stays up marked as expired.
// gone: archived, pending, never-checked web finds, other markets and links we can't track (tracked = false, see
// trackedLinkOf) have no page, unless the store is open (see open-stores.ts): then an untracked link goes straight to the shop.
export function dealVisibility(c: VisibilityFields, today: string, unverified: boolean, tracked = true): DealVisibility {
  if (!(tracked || c.store_open) || !onSpanishSite(storeOf(c))) return "gone";
  if (isPublic(c, today, unverified)) return "live";
  const wasPublic = statusOf(c, today) === "expired" && (unverified || c.source !== "web" || c.verified);
  return wasPublic ? "expired" : "gone";
}

export type RouteVerdict = { kind: "ok" } | { kind: "missing" } | { kind: "moved"; to: string };

export type DealRouteRow = VisibilityFields & { id: number; title: string; store_name: string };

// A landing page of its own (a product, a category), not the shop's front door: only those tell two deals apart.
// "https://www.samsung.com/es" is Samsung's home, shared by every general promotion it runs.
export function isProductLanding(targetUrl: string, storeWebsite: string): boolean {
  if (!URL.canParse(targetUrl)) return false;
  const page = (raw: string) => {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  };
  const segments = new URL(targetUrl).pathname.split("/").filter(Boolean);
  if (!segments.length || (segments.length === 1 && /^[a-z]{2}([-_][a-z]{2})?$/i.test(segments[0]))) return false;
  return !URL.canParse(storeWebsite) || page(targetUrl) !== page(storeWebsite);
}

export type DealSuccessor = { id: number; title: string; store_name: string };

// /chollos/<param>: missing when there is no page for it, moved when the words after the id are not the canonical ones.
// `successor` is the live deal for the same product (see liveSuccessor in route-lookup): a network re-issues a product's
// offer under a new id when its price or dates change, and the address people and assistants already link to must
// keep leading to the current one. Only a deal that is no longer live moves there.
export function dealRouteVerdict(param: string, row: DealRouteRow | undefined, today: string, unverified: boolean, tracked = true, successor?: DealSuccessor): RouteVerdict {
  const id = parseDealId(param);
  if (!id || !row || row.id !== id) return { kind: "missing" };
  const seen = dealVisibility(row, today, unverified, tracked);
  if (seen !== "live" && successor) return { kind: "moved", to: dealPath(successor) };
  if (seen === "gone") return { kind: "missing" };
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

// Pages whose URLs come from a fixed list, decided without the database: /categorias/<slug>, /marcas/<slug> and
// /ofertas/<event> exist only for known slugs, and the old home-page category links (/?cat=moda, no search) moved to /categorias/moda
export function fixedRouteVerdict(pathname: string, search: URLSearchParams): RouteVerdict | null {
  const cat = /^\/categorias\/([^/]+)$/.exec(pathname);
  if (cat) return categoryOf(cat[1]) ? { kind: "ok" } : { kind: "missing" };
  const brand = /^\/marcas\/([^/]+)$/.exec(pathname);
  if (brand) return brandOf(brand[1]) ? { kind: "ok" } : { kind: "missing" };
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

// The private side (the panel, client demos, the API): a visitor without a session is sent to sign in there. Any other
// URL that is not on the public site does not exist: a typo or an old link gets the site's 404, not the panel's login.
const PRIVATE = /^\/(panel|demo|demo-preview|api)(\/|$)/;
export const needsSignIn = (pathname: string): boolean => PRIVATE.test(pathname);
