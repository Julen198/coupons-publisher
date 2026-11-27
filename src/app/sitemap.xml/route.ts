import { sitemapEntries } from "@/lib/sitemap-entries";
import { siteUrl } from "@/lib/site-text";
import { esc } from "@/lib/render-page";

// The public site's URLs for search engines (which ones and why: sitemap-entries.ts, shared with the IndexNow cron)
export async function GET() {
  const base = siteUrl();
  const entries = await sitemapEntries();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((u) => `  <url><loc>${esc(base + u.path)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
