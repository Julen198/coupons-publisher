import { sql, type Client, type Coupon, type Store } from "@/lib/db";
import { canRedirect, statusOf } from "@/lib/coupon-status";
import { redirectPage } from "@/lib/redirect-page";
import { untrackedUrl } from "@/lib/render-page";
import { publishUnverified } from "@/lib/settings";
import { longDate, madridToday, siteUrl } from "@/lib/site-text";
import { isTracked, trackedLinkOf } from "@/lib/tracked-link";
import { SITE_CLIENT_SLUG, accountsFor, clientLinks } from "@/lib/link-accounts";
import { recordClick } from "@/lib/clicks";
import { clickSource, isBot, refPath, uaHash, type ClickKind } from "@/lib/click-signals";

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
  const [store] = coupon ? await db<Store[]>`SELECT *, logo_data <> '' AS has_logo FROM stores WHERE id = ${coupon.store_id}` : [];
  if (!client || !coupon || !store) return null;
  // pending/rejected reader shares, unchecked web finds: no redirect and no click (expired and archived still go through:
  // clients' exported pages may still link them)
  if (!canRedirect(coupon, madridToday().iso, await publishUnverified())) return null;
  return { client, coupon, store };
}

// Never block the reader over a lost count
async function count(t: Target, kind: ClickKind, req: Request, ref: string, source: string) {
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return;
  try {
    await recordClick({ clientId: t.client.id, storeId: t.store.id, couponId: t.coupon.id, kind, ref, source, uaHash: uaHash(ua ?? "", madridToday().iso) });
  } catch (e) {
    console.error("click insert failed", e);
  }
}

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });

// Only CuponLab's own deal pages get the loading page: a client's exported page keeps the plain 302, so the network
// still sees the client's own page as the referrer and no CuponLab branding shows on their readers' way out
const toStore = (t: Target, location: string) => (t.client.slug === SITE_CLIENT_SLUG ? loadingPage(t, location) : redirect(location));

// The loading page on the way to the store (SiteRedirect board): it jumps on its own to `location` after a moment, or
// waits for a choice when the coupon has expired. Same headers as the 302 it replaces.
function loadingPage(t: Target, location: string) {
  const status = statusOf(t.coupon, madridToday().iso);
  const html = redirectPage({
    url: location,
    storeName: t.store.name,
    storeSlug: t.store.slug,
    hasLogo: !!t.store.has_logo,
    code: t.coupon.kind === "code" ? t.coupon.code : "",
    expired: status === "expired" || status === "archived",
    expiredOn: status === "expired" && t.coupon.expires_at ? longDate(t.coupon.expires_at) : "",
  });
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade", "X-Robots-Tag": "noindex, nofollow" },
  });
}

// Click on a coupon button: count it, then send the reader to the tracked link through the loading page. If that link stopped being tracked since
// the page was rendered (data changed), the reader still goes to the store and the click is logged as untracked so it
// shows in Clics. Whatever fails, the reader is redirected: never a 500.
export async function GET(req: Request, ctx: RouteContext<"/go/[client]/[coupon]">) {
  let target: Target | null = null;
  try {
    target = await load(ctx);
    if (!target) return NOT_FOUND();
    const { client, coupon, store } = target;
    const ref = refPath(req.headers.get("referer"), siteUrl());
    // where the click was made: the link's ?o=, else what the page it came from says (see clickSource)
    const source = clickSource(new URL(req.url).searchParams.get("o"), ref);
    const link = trackedLinkOf(coupon, store, accountsFor(await clientLinks(client), store), source);
    if (isTracked(link)) {
      await count(target, "go", req, ref, source);
      return toStore(target, link.url);
    }
    console.warn("untracked click", { client: client.slug, coupon: coupon.id, store: store.slug, problem: link.problem });
    await count(target, "untracked", req, ref, source);
    return toStore(target, untrackedUrl(coupon, store));
  } catch (e) {
    console.error("go redirect failed", e);
    return redirect(target ? untrackedUrl(target.coupon, target.store) : "/");
  }
}

// "Copiar código" (navigator.sendBeacon): counts a copy, body = the page path it was copied on, ?o= its origin. Always 204, so the
// page never waits on or reacts to it.
export async function POST(req: Request, ctx: RouteContext<"/go/[client]/[coupon]">) {
  try {
    const target = await load(ctx);
    if (target) {
      const ref = refPath((await req.text()).slice(0, 300));
      await count(target, "copy", req, ref, clickSource(new URL(req.url).searchParams.get("o"), ref));
    }
  } catch (e) {
    console.error("copy beacon failed", e);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
