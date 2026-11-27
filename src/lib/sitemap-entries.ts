// The public site's URLs for search engines, with what each one shows boiled down to a fingerprint: the sitemap lists
// them (sitemap.xml) and the IndexNow cron pings the ones whose fingerprint changed (indexnow-cron.ts).
// Home, the categories, the shopping-date pages, the store index, the brand index and the brands with enough live
// deals (indexableBrand), the calendar, the text pages, every store with live or recently expired coupons (see
// siteRecentlyExpired), each store on the shopping dates in season and every live coupon. Each list counts deals the
// way its page does, so nothing listed here is a page that answers noindex.
import { publishedGuides } from "./guide-index";
import { siteCoupons, siteRecentlyExpired, type SiteCoupon } from "./public-site";
import { CATEGORIES, categoryPath } from "./catalog";
import { EVENT_PAGES, eventCouponsByStore, storeEventPath, storeEventsInSeason } from "./event-pages";
import { indexableCategory } from "./category-pages";
import { BRANDS, brandPath, indexableBrand } from "./brands";
import { contactEmail, dealPath, madridToday } from "./site-text";
import { isPerk } from "./perks";
import { fingerprint } from "./indexnow-sync.ts";

export interface SitemapEntry { path: string; lastmod?: string; sig: string }

// What a deal page shows that a search engine cares about
const dealSig = (c: SiteCoupon) => fingerprint([c.display_title, c.code, c.discount, c.description, c.expires_at, c.verified, c.about_status, c.about, c.store_slug]);

export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const [coupons, expired, guides] = await Promise.all([siteCoupons(), siteRecentlyExpired(), publishedGuides()]);
  const sigOf = new Map([...coupons, ...expired].map((c) => [c.id, dealSig(c)]));
  // a list page's fingerprint: the deals on it (sorted, so the order of the query doesn't matter)
  const listSig = (deals: readonly SiteCoupon[], ...extra: unknown[]) => fingerprint([...deals.map((c) => sigOf.get(c.id)!).sort(), ...extra]);
  const byStore = new Map<string, { live: SiteCoupon[]; expired: SiteCoupon[] }>();
  for (const c of coupons) (byStore.get(c.store_slug) ?? byStore.set(c.store_slug, { live: [], expired: [] }).get(c.store_slug)!).live.push(c);
  for (const c of expired) (byStore.get(c.store_slug) ?? byStore.set(c.store_slug, { live: [], expired: [] }).get(c.store_slug)!).expired.push(c);
  // a store page with a guide says when its guide last changed (hand-written ones have no date)
  const lastmod = new Map(guides.filter((g) => g.updatedAt).map((g) => [`/tiendas/${g.slug}`, g.updatedAt!.toISOString().slice(0, 10)]));
  const today = madridToday().iso;
  const out: SitemapEntry[] = [{ path: "/", sig: listSig(coupons) }];
  for (const c of CATEGORIES) {
    const deals = coupons.filter((x) => x.store_category === c.slug);
    if (indexableCategory(deals.length)) out.push({ path: categoryPath(c.slug), sig: listSig(deals) });
  }
  for (const e of EVENT_PAGES) out.push({ path: `/ofertas/${e.slug}`, sig: fingerprint([eventCouponsByStore(e, coupons, today)]) });
  out.push({ path: "/tiendas", sig: fingerprint([...byStore].map(([s, d]) => [s, d.live.length]).sort()) });
  const brands = BRANDS.map((b) => ({ b, deals: coupons.filter((c) => !isPerk(c) && c.brand_slugs.includes(b.slug)) })).filter((x) => indexableBrand(x.deals.length));
  out.push({ path: "/marcas", sig: fingerprint(brands.map((x) => [x.b.slug, x.deals.length])) });
  for (const { b, deals } of brands) out.push({ path: brandPath(b.slug), sig: listSig(deals) });
  for (const p of ["/calendario", "/metodologia", "/aviso-de-afiliacion", "/aviso-legal", "/condiciones-de-uso", "/asistentes-ia", ...(contactEmail() ? ["/contacto"] : [])]) out.push({ path: p, sig: "static" });
  for (const [slug, d] of byStore) {
    const path = `/tiendas/${slug}`;
    out.push({ path, lastmod: lastmod.get(path), sig: listSig([...d.live, ...d.expired], lastmod.get(path) ?? "") });
  }
  // each store on the shopping dates coming up (/ofertas/black-friday/<store>), listed from six weeks before, when people
  // start searching «black friday <tienda>», but only once the store has coupons that name the event: without them the
  // page is noindex (storeEventIndexable)
  for (const e of storeEventsInSeason(today)) {
    for (const s of eventCouponsByStore(e, coupons, today)) out.push({ path: storeEventPath(e.slug, s.slug), sig: listSig(byStore.get(s.slug)?.live ?? [], e.slug, s.n) });
  }
  for (const c of coupons) out.push({ path: dealPath(c), sig: sigOf.get(c.id)! });
  // one entry per URL (a deal path can't repeat a store path, but keep the sitemap clean whatever happens)
  const seen = new Set<string>();
  return out.filter((x) => !seen.has(x.path) && !!seen.add(x.path));
}
