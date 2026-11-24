import { publishedGuides } from "@/lib/guide-index";
import { siteCoupons, siteRecentlyExpired } from "@/lib/public-site";
import { CATEGORIES, categoryPath } from "@/lib/catalog";
import { EVENT_PAGES, eventCouponsByStore, storeEventPath, storeEventsInSeason } from "@/lib/event-pages";
import { indexableCategory } from "@/lib/category-pages";
import { BRANDS, brandPath, indexableBrand } from "@/lib/brands";
import { contactEmail, dealPath, madridToday, siteUrl } from "@/lib/site-text";
import { esc } from "@/lib/render-page";

// The public site's URLs for search engines: home, the categories, the shopping-date pages, the store index, the
// brand index and the brands with enough live deals (indexableBrand), the calendar, the text pages, every store with live or recently expired coupons (see siteRecentlyExpired), each store on
// the shopping dates in season and every live coupon
export async function GET() {
  const base = siteUrl();
  const [coupons, expired, guides] = await Promise.all([siteCoupons(), siteRecentlyExpired(), publishedGuides()]);
  const stores = [...new Set([...coupons, ...expired].map((c) => c.store_slug))];
  // each store on the shopping dates coming up (/ofertas/black-friday/<store>), listed from six weeks before, when people
  // start searching «black friday <tienda>», but only once the store has coupons that name the event: without them the
  // page is noindex (storeEventIndexable)
  const today = madridToday().iso;
  const storeEvents = storeEventsInSeason(today).flatMap((e) => eventCouponsByStore(e, coupons, today).map((s) => storeEventPath(e.slug, s.slug)));
  // a store page with a guide says when its guide last changed (hand-written ones have no date)
  const lastmod = new Map(guides.filter((g) => g.updatedAt).map((g) => [`/tiendas/${g.slug}`, g.updatedAt!.toISOString().slice(0, 10)]));
  const urls = ["/", ...CATEGORIES.filter((c) => indexableCategory(coupons.filter((x) => x.store_category === c.slug).length)).map((c) => categoryPath(c.slug)), ...EVENT_PAGES.map((e) => `/ofertas/${e.slug}`), "/tiendas", "/marcas", ...BRANDS.filter((b) => indexableBrand(coupons.filter((c) => c.brand_slugs.includes(b.slug)).length)).map((b) => brandPath(b.slug)), "/calendario", "/metodologia", "/aviso-de-afiliacion", "/asistentes-ia", ...(contactEmail() ? ["/contacto"] : []), ...stores.map((s) => `/tiendas/${s}`), ...storeEvents, ...coupons.map(dealPath)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(base + u)}</loc>${lastmod.has(u) ? `<lastmod>${lastmod.get(u)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
