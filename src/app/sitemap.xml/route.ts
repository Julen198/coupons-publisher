import { publishedGuides } from "@/lib/guide-index";
import { siteCoupons } from "@/lib/public-site";
import { contactEmail, dealPath, siteUrl } from "@/lib/site-text";
import { esc } from "@/lib/render-page";

// The public site's URLs for search engines: home, the store index, the calendar, the text pages, every store with live coupons and every live coupon
export async function GET() {
  const base = siteUrl();
  const [coupons, guides] = await Promise.all([siteCoupons(), publishedGuides()]);
  const stores = [...new Set(coupons.map((c) => c.store_slug))];
  // a store page with a guide says when its guide last changed (hand-written ones have no date)
  const lastmod = new Map(guides.filter((g) => g.updatedAt).map((g) => [`/tiendas/${g.slug}`, g.updatedAt!.toISOString().slice(0, 10)]));
  const urls = ["/", "/tiendas", "/calendario", "/metodologia", "/aviso-de-afiliacion", ...(contactEmail() ? ["/contacto"] : []), ...stores.map((s) => `/tiendas/${s}`), ...coupons.map(dealPath)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(base + u)}</loc>${lastmod.has(u) ? `<lastmod>${lastmod.get(u)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
