import { sql, type Client, type Coupon, type Store } from "@/lib/db";
import { canRedirect } from "@/lib/coupon-status";
import { couponAffiliateUrl } from "@/lib/render-page";
import { publishUnverified } from "@/lib/settings";
import { madridToday } from "@/lib/site-text";

// Crawlers and link-preview fetchers follow links too; don't count them as clicks
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|curl|wget|python-requests/i;

// Click on a coupon button: count it, then send the reader to the affiliate link.
export async function GET(req: Request, ctx: RouteContext<"/go/[client]/[coupon]">) {
  const { client: clientSlug, coupon: couponParam } = await ctx.params;
  const couponId = Number(couponParam);
  if (!Number.isInteger(couponId) || couponId <= 0) return new Response("No encontrado", { status: 404 });

  const db = sql();
  const [client] = await db<Client[]>`SELECT * FROM clients WHERE slug = ${clientSlug}`;
  const [coupon] = await db<Coupon[]>`SELECT * FROM coupons WHERE id = ${couponId}`;
  const [store] = coupon ? await db<Store[]>`SELECT * FROM stores WHERE id = ${coupon.store_id}` : [];
  if (!client || !coupon || !store) return new Response("No encontrado", { status: 404 });
  // pending/rejected reader shares, archived, unchecked web finds: no redirect and no click (expired still goes through)
  if (!canRedirect(coupon, madridToday().iso, await publishUnverified())) return new Response("No encontrado", { status: 404 });
  // the client's own account in this store's network, if it has one; otherwise ours
  const [own] = await db<{ tracking_url: string }[]>`
    SELECT tracking_url FROM client_tracking WHERE client_id = ${client.id} AND store_id = ${store.id} AND network = ${store.network}`;

  if (!BOT_UA.test(req.headers.get("user-agent") ?? "")) {
    try {
      await db`INSERT INTO clicks (client_id, store_id, coupon_id) VALUES (${client.id}, ${store.id}, ${coupon.id})`;
    } catch (e) {
      console.error("click insert failed", e); // never block the reader's redirect over a lost count
    }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: couponAffiliateUrl(client, store, coupon, own?.tracking_url), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" },
  });
}
