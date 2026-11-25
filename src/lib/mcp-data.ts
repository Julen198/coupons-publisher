import { dealPath, madridToday, siteUrl } from "./site-text.ts";
import { goHref, siteClient, siteCoupons, type SiteCoupon } from "./public-site";
import { isPerk } from "./perks.ts";
import type { Client } from "./db";
import type { McpData, McpDeal } from "./mcp.ts";
import { recordMcpCall } from "./ai-stats";
import { mcpQueryOf } from "./ai-traffic.ts";

// The live deals the MCP server answers from: the same coupons the public site shows, so an assistant never offers
// one a reader couldn't find on cuponlab.com. One per request (the route builds it for each POST).
export function mcpData(): McpData {
  const base = siteUrl();
  const utm = (path: string, source: string) => `${base}${path}?utm_source=${source}`;
  const page = (d: McpDeal, source: string) => utm(dealPath({ id: d.id, title: d.title, store_name: d.store }), source);
  let coupons = new Map<number, SiteCoupon>();
  let client: Client | undefined;
  return {
    siteUrl: base,
    today: () => madridToday().iso,
    async deals(): Promise<McpDeal[]> {
      const [rows, owner] = await Promise.all([siteCoupons(), siteClient()]);
      coupons = new Map(rows.map((c) => [c.id, c]));
      client = owner;
      return rows.map((c) => ({
        id: c.id, store: c.store_name, store_slug: c.store_slug, category: c.store_category, kind: c.kind, title: c.display_title,
        description: c.description, code: c.code, discount: c.discount, expires_at: c.expires_at, verified: c.verified, score: c.score,
        comments: c.comments, uses_week: c.uses_week, brands: c.brand_slugs, perk: isPerk(c),
      }));
    },
    pageUrl: page,
    // through /go (counted under `source`, then the tracked link); the deal's page if the coupon wasn't loaded
    goUrl: (d, source) => {
      const c = coupons.get(d.id);
      if (!c) return page(d, source);
      const href = goHref(client, c, source);
      return href.startsWith("/") ? `${base}${href}` : href;
    },
    storeUrl: (slug, source) => utm(`/tiendas/${encodeURIComponent(slug)}`, source),
    logCall: (tool, args, source) => recordMcpCall(source, tool, mcpQueryOf(args)),
  };
}
