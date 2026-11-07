import { sql } from "./db";
import { countrySql, withCountryColumn } from "./country-column.ts";
import type { CountryStore } from "./market.ts";
import { madridToday, parseDealId } from "./site-text.ts";
import { dealRouteVerdict, storeRouteVerdict, type DealRouteRow, type RouteVerdict } from "./site-routes.ts";

// Called from the proxy, before the page streams, so a missing deal or store answers 404 and an old slug 308.
// One small indexed query each; the page keeps its own notFound()/permanentRedirect() as a fallback.

export async function dealRoute(param: string): Promise<RouteVerdict> {
  const id = parseDealId(param);
  if (!id) return { kind: "missing" };
  const [row] = await withCountryColumn((cc) => sql()<(DealRouteRow & { unverified: boolean })[]>`
    SELECT c.id, c.title, c.verified, c.archived, c.expires_at, c.source, c.review, s.name AS store_name, s.website AS store_website,
           s.slug AS store_slug, s.tracking_url AS store_tracking_url, ${sql().unsafe(countrySql(cc, "s"))},
           coalesce((SELECT value FROM settings WHERE key = 'publish_unverified') = '1', false) AS unverified
    FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.id = ${id}`);
  return dealRouteVerdict(param, row, madridToday().iso, !!row?.unverified);
}

export async function storeRoute(slug: string): Promise<RouteVerdict> {
  const [row] = await withCountryColumn((c) => sql()<CountryStore[]>`
    SELECT name, slug, website, tracking_url, ${sql().unsafe(countrySql(c, "stores", ""))} FROM stores WHERE slug = ${slug}`);
  return storeRouteVerdict(row);
}
