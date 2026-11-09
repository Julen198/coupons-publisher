import { INDEXNOW_KEY } from "@/lib/seo-auto";

// IndexNow's ownership check: the key our pings send (keyLocation points here). Public by design.
export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
