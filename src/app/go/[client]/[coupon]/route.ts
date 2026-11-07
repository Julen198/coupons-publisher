import { sql, type Client, type Coupon, type Store } from "@/lib/db";
import { canRedirect } from "@/lib/coupon-status";
import { untrackedUrl } from "@/lib/render-page";
import { publishUnverified } from "@/lib/settings";
import { madridToday, siteUrl } from "@/lib/site-text";
import { isTracked, trackedLinkOf } from "@/lib/tracked-link";
import { accountsFor, clientLinks } from "@/lib/link-accounts";
import { recordClick } from "@/lib/clicks";
import { isBot, refPath, uaHash, type ClickKind } from "@/lib/click-signals";

type Target = { client: Client; coupon: Coupon; store: Store };

const NOT_FOUND = () => new Response("No encontrado", { status: 404 });

// The client, coupon and store of /go/<client>/<coupon>, or null when there's no such click to count
async function load(ctx: RouteContext<"/go/[client]/[coupon]">): Promise<Target | null> {
  const { client: clientSlug, coupon: couponParam } = await ctx.params;
  const couponId = Number(couponParam);
  if (!Number.isInteger(couponId) || couponId <= 0) return null;
  const db = sql();
  const [[client], [coupon]] = await Promise.all([
    db<Client[]>`SELECT * FROM clients WHERE slug = ${clientSlug}`,
    db<Coupon[]>`SELECT * FROM coupons WHERE id = ${couponId}`,
  ]);
  const [store] = coupon ? await db<Store[]>`SELECT * FROM stores WHERE id = ${coupon.store_id}` : [];
  if (!client || !coupon || !store) return null;
  // pending/rejected reader shares, unchecked web finds: no redirect and no click (expired and archived still go through:
  // clients' exported pages may still link them)
  if (!canRedirect(coupon, madridToday().iso, await publishUnverified())) return null;
  return { client, coupon, store };
}

// Never block the reader over a lost count
async function count(t: Target, kind: ClickKind, req: Request, ref: string) {
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return;
  try {
    await recordClick({ clientId: t.client.id, storeId: t.store.id, couponId: t.coupon.id, kind, ref, uaHash: uaHash(ua ?? "", madridToday().iso) });
  } catch (e) {
    console.error("click insert failed", e);
  }
}

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });

// Click on a coupon button: count it, then send the reader to the tracked link. If that link stopped being tracked since
// the page was rendered (data changed), the reader still goes to the store and the click is logged as untracked so it
// shows in Clics. Whatever fails, the reader is redirected: never a 500.
export async function GET(req: Request, ctx: RouteContext<"/go/[client]/[coupon]">) {
  let target: Target | null = null;
  try {
    target = await load(ctx);
    if (!target) return NOT_FOUND();
    const { client, coupon, store } = target;
    const link = trackedLinkOf(coupon, store, accountsFor(await clientLinks(client), store));
    const ref = refPath(req.headers.get("referer"), siteUrl());
    if (isTracked(link)) {
      await count(target, "go", req, ref);
      return redirect(link.url);
    }
    console.warn("untracked click", { client: client.slug, coupon: coupon.id, store: store.slug, problem: link.problem });
    await count(target, "untracked", req, ref);
    return redirect(untrackedUrl(coupon, store));
  } catch (e) {
    console.error("go redirect failed", e);
    return redirect(target ? untrackedUrl(target.coupon, target.store) : "/");
  }
}

// "Copiar código" (navigator.sendBeacon): counts a copy, body = the page path it was copied on. Always 204, so the
// page never waits on or reacts to it.
export async function POST(req: Request, ctx: RouteContext<"/go/[client]/[coupon]">) {
  try {
    const target = await load(ctx);
    if (target) await count(target, "copy", req, refPath((await req.text()).slice(0, 300)));
  } catch (e) {
    console.error("copy beacon failed", e);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
