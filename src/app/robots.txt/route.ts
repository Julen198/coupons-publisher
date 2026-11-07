import { robotsTxt } from "@/lib/robots";
import { siteUrl } from "@/lib/site-text";

// Only the public deals site is for search engines; the panel and clients' pages stay out (see src/lib/robots.ts)
export function GET() {
  return new Response(robotsTxt(siteUrl()), { headers: { "Content-Type": "text/plain" } });
}
