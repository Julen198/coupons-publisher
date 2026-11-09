import { publishedGuides } from "@/lib/guide-index";
import { siteCoupons } from "@/lib/public-site";
import { llmsTxt } from "@/lib/seo-auto";
import { siteUrl } from "@/lib/site-text";

// /llms.txt for AI assistants: the site in one paragraph, every published guide and the stores with most coupons.
// Built from the database on each request, so a new guide shows up here the moment it's published.
export async function GET() {
  const [guides, coupons] = await Promise.all([publishedGuides(), siteCoupons()]);
  const counts = coupons.reduce((m, c) => m.set(c.store_slug, { slug: c.store_slug, name: c.store_name, live: (m.get(c.store_slug)?.live ?? 0) + 1 }), new Map<string, { slug: string; name: string; live: number }>());
  const top = [...counts.values()].sort((a, b) => b.live - a.live).slice(0, 15);
  return new Response(llmsTxt(siteUrl(), guides, top), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
