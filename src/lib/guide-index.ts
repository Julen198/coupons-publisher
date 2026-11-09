// The published guides (hand-written and automatic) for links, /llms.txt and the sitemap, and the IndexNow ping sent
// when one goes out. The rules are in seo-auto.ts.
import { cache } from "react";
import { sql } from "./db";
import { indexNowRequest, type GuideLink } from "./seo-auto.ts";
import { siteUrl } from "./site-text";
import { guideSlugs, storeGuide, type StoreGuide } from "./store-guides.ts";

export const publishedGuides = cache(async (): Promise<GuideLink[]> => {
  const handSlugs = guideSlugs();
  try {
    const [stores, rows] = await Promise.all([
      sql()<{ slug: string; name: string; category: string }[]>`SELECT slug, name, category FROM stores`,
      sql()<{ slug: string; name: string; category: string; content: StoreGuide; at: Date }[]>`
        SELECT s.slug, s.name, s.category, g.content, coalesce(g.rewritten_at, g.published_at) AS at
        FROM store_guides g JOIN stores s ON s.id = g.store_id WHERE g.status = 'published'`,
    ]);
    const bySlug = new Map(stores.map((s) => [s.slug, s]));
    const hand = handSlugs.flatMap((slug) => {
      const s = bySlug.get(slug);
      const g = storeGuide(slug);
      return s && g ? [{ slug, name: s.name, keyword: g.keyword, description: g.description, category: s.category, updatedAt: null }] : [];
    });
    const auto = rows
      .filter((r) => !handSlugs.includes(r.slug))
      .map((r) => ({ slug: r.slug, name: r.name, keyword: r.content.keyword, description: r.content.description, category: r.category, updatedAt: r.at }));
    return [...auto.sort((a, b) => +b.updatedAt - +a.updatedAt), ...hand];
  } catch (e) {
    console.error("published guides read failed", e); // pages render without the links rather than failing
    return [];
  }
});

// Tells IndexNow engines these pages changed. Never throws: a failed ping only means they find out later.
export async function pingIndexNow(paths: readonly string[]): Promise<boolean> {
  if (!paths.length) return true;
  const req = indexNowRequest(siteUrl(), paths);
  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 202) console.error("IndexNow ping refused", res.status, await res.text().catch(() => ""));
    return res.ok || res.status === 202;
  } catch (e) {
    console.error("IndexNow ping failed", e);
    return false;
  }
}
