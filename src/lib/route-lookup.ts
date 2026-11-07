import { sql } from "./db";
import { countrySql, withCountryColumn } from "./country-column.ts";
import { publicText } from "./translation.ts";
import { translationSql, withTranslationColumns } from "./translation-column.ts";
import type { CountryStore } from "./market.ts";
import { madridToday, parseDealId } from "./site-text.ts";
import { dealRouteVerdict, storeRouteVerdict, type DealRouteRow, type RouteVerdict } from "./site-routes.ts";
import { isTracked, trackedLinkOf } from "./tracked-link.ts";
import { accountsFor, siteLinks } from "./link-accounts";
import { altDomainsColumn, altDomainsSql } from "./tracking-columns.ts";

// Called from the proxy, before the page streams, so a missing deal or store answers 404 and an old slug 308.
// One small indexed query each; the page keeps its own notFound()/permanentRedirect() as a fallback.

type DealLinkRow = DealRouteRow & {
  unverified: boolean; description: string; store_id: number; target_url: string; publisher_id: string;
  store_network: string; store_merchant_id: string; store_publisher_id: string; store_alt_domains: string;
};

export async function dealRoute(param: string): Promise<RouteVerdict> {
  const id = parseDealId(param);
  if (!id) return { kind: "missing" };
  const [[row], links] = await Promise.all([
    withCountryColumn((cc) => withTranslationColumns((tc) => altDomainsColumn.run((ac) => sql()<DealLinkRow[]>`
    SELECT c.id, c.title, c.description, ${sql().unsafe(translationSql(tc, "c"))}, c.verified, c.archived, c.expires_at, c.source, c.review, s.name AS store_name, s.website AS store_website,
           s.slug AS store_slug, s.tracking_url AS store_tracking_url, ${sql().unsafe(countrySql(cc, "s"))},
           c.store_id, c.target_url, c.publisher_id, s.network AS store_network, s.merchant_id AS store_merchant_id,
           s.publisher_id AS store_publisher_id, ${sql().unsafe(altDomainsSql(ac, "s"))},
           coalesce((SELECT value FROM settings WHERE key = 'publish_unverified') = '1', false) AS unverified
    FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.id = ${id}`))),
    siteLinks(),
  ]);
  // the launch gate, as in siteCoupons: no tracked link, no page
  const tracked = !!row && isTracked(trackedLinkOf(row, {
    slug: row.store_slug ?? "", network: row.store_network, merchant_id: row.store_merchant_id, tracking_url: row.store_tracking_url ?? "",
    publisher_id: row.store_publisher_id, website: row.store_website, alt_domains: row.store_alt_domains,
  }, accountsFor(links, { id: row.store_id, network: row.store_network })));
  // the slug comes from the title readers see: the Spanish one for a translated deal (see titled in public-site)
  return dealRouteVerdict(param, row && { ...row, title: publicText(row).title }, madridToday().iso, !!row?.unverified, tracked);
}

export async function storeRoute(slug: string): Promise<RouteVerdict> {
  const [row] = await withCountryColumn((c) => sql()<CountryStore[]>`
    SELECT name, slug, website, tracking_url, ${sql().unsafe(countrySql(c, "stores", ""))} FROM stores WHERE slug = ${slug}`);
  return storeRouteVerdict(row);
}
