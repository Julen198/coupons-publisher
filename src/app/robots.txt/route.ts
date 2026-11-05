import { siteUrl } from "@/lib/site-text";

// Only the public deals site is for search engines; the panel and clients' pages stay out
export function GET() {
  const body = ["User-agent: *", "Allow: /$", "Allow: /chollos/", "Allow: /tiendas/", "Disallow: /", "", `Sitemap: ${siteUrl()}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
