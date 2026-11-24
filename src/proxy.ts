import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { dealRoute, storeRoute } from "@/lib/route-lookup";
import { fixedRouteVerdict, isDocumentRequest, needsSignIn, type RouteVerdict } from "@/lib/site-routes";
import { orNullAfter } from "@/lib/with-timeout";
import { hostRole, hostVerdict, PANEL_ROBOTS } from "@/lib/hosts";
import { siteUrl } from "@/lib/site-text";

// The public deals site: indexable, open to everyone
const SITE = [/^\/$/, /^\/entrar(\/(confirmar|nombre))?$/, /^\/compartir$/, /^\/cuenta$/, /^\/chollos\/[^/]+$/, /^\/chollos\/[^/]+\/opengraph-image/, /^\/tiendas(\/[^/]+)?$/, /^\/tiendas\/[^/]+\/opengraph-image/, /^\/categorias\/[^/]+$/, /^\/categorias\/[^/]+\/opengraph-image/, /^\/marcas(\/[^/]+)?$/, /^\/opengraph-image/, /^\/ofertas\/[^/]+(\/[^/]+)?$/, /^\/ofertas\/[^/]+\/opengraph-image/, /^\/calendario$/, /^\/(metodologia|aviso-de-afiliacion|contacto|no-encontrado)$/, /^\/sitemap\.xml$/];
// Reachable without signing in: the public site, login, accepting an invitation, and what publishers embed on their sites
const PUBLIC = [...SITE, /^\/login$/, /^\/login\/(magic|recuperar|restablecer)$/, /^\/invite\//, /^\/p\//, /^\/go\//, /^\/widget\.js$/, /^\/robots\.txt$/, /^\/llms\.txt$/, /^\/indexnow\.txt$/, /^\/icon\.svg$/, /^\/store-logo\//,
  // Telegram webhook and its daily cron: each checks its own secret header instead of a session
  /^\/api\/telegram(\/cron)?$/,
  // date alerts: the cron checks CRON_SECRET, the unsubscribe link carries its own signed token
  /^\/api\/date-alerts\/(cron|baja)$/,
  // the network sync, click retention and SEO guide crons: each checks CRON_SECRET
  /^\/api\/(networks|clicks|guides)\/cron$/];

const DEAL_PAGE = /^\/chollos\/([^/]+)$/;
const STORE_PAGE = /^\/tiendas\/([^/]+)$/;
// a store's page for a shopping date (/ofertas/black-friday/myprotein): the event was checked by fixedRouteVerdict
const EVENT_STORE_PAGE = /^\/ofertas\/[^/]+\/([^/]+)$/;
// Rendered by src/app/(site)/no-encontrado: a route that only calls notFound(), so it answers with a real 404
const NOT_FOUND_PAGE = "/no-encontrado";
// Past this the request goes on to the page, which runs the same checks itself. Most lookups answer in a few ms; the
// slow ones are a cold function opening its first connection, where waiting longer only delays the page (1.2 s was
// timing out about forty times a week, each one a visitor kept waiting)
const ROUTE_LOOKUP_TIMEOUT_MS = 600;
// Verdicts already worked out by this instance, reused for a few minutes: a deal or store page that is shared or
// crawled is looked up once, not on every hit
const VERDICT_TTL_MS = 5 * 60_000;
const VERDICT_CACHE_MAX = 500;
const verdicts = new Map<string, { at: number; verdict: RouteVerdict }>();
function remembered(key: string): RouteVerdict | undefined {
  const hit = verdicts.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > VERDICT_TTL_MS) {
    verdicts.delete(key);
    return undefined;
  }
  return hit.verdict;
}
function remember(key: string, verdict: RouteVerdict) {
  if (verdicts.size >= VERDICT_CACHE_MAX) verdicts.delete(verdicts.keys().next().value!);
  verdicts.set(key, { at: Date.now(), verdict });
}

// Deal and store pages stream behind the site layout's Suspense, which fixes a 200 before the page can call notFound()
// or permanentRedirect(). Deciding here keeps the HTTP status honest. Only HTML document requests need it: RSC
// navigations and prefetches pass through (their links come from the database), and a failed lookup lets the request
// through to the page, which runs the same checks.
async function sitePageVerdict(req: NextRequest): Promise<RouteVerdict | null> {
  if (!isDocumentRequest(req.method, req.headers.get("accept"), req.nextUrl)) return null;
  const { pathname } = req.nextUrl;
  const deal = DEAL_PAGE.exec(pathname);
  const eventStore = EVENT_STORE_PAGE.exec(pathname);
  const store = deal ? null : (STORE_PAGE.exec(pathname) ?? (eventStore && !eventStore[1].startsWith("opengraph-image") ? eventStore : null));
  if (!deal && !store) return null;
  let slug = "";
  if (store) {
    try {
      slug = decodeURIComponent(store[1]);
    } catch {
      return { kind: "missing" }; // malformed %-escape: no store can have it
    }
  }
  const key = deal ? `deal:${deal[1]}` : `store:${slug}`;
  const known = remembered(key);
  if (known) return known;
  // A stalled pooler must not hold every deal and store page for postgres.js's 30 s connect timeout. A late answer is
  // still remembered for the next request.
  const lookup = deal ? dealRoute(deal[1]) : storeRoute(slug);
  lookup.then((v) => remember(key, v), () => {});
  // A timeout is expected now and then (cold start) and the page still answers: a warning. Anything else (the
  // database refusing, a bad query) stays an error, so the error list shows only what needs a look.
  return orNullAfter(lookup, ROUTE_LOOKUP_TIMEOUT_MS, (e) => {
    const slow = e instanceof Error && e.message.startsWith("timed out");
    (slow ? console.warn : console.error)("[proxy] route lookup failed", pathname, slow ? e.message : e);
  });
}

// First gate only (signature check, no DB). Pages and actions re-check the user, role and session version.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // the panel on its own host (PANEL_URL) and the public site on SITE_URL: each sends the other's pages across
  const panelUrl = process.env.PANEL_URL ?? "";
  const role = hostRole(req.headers.get("host"), panelUrl, siteUrl());
  const onHost = hostVerdict(role, pathname, search, panelUrl, siteUrl());
  if (onHost.kind === "redirect") return NextResponse.redirect(onHost.to, 307);
  if (onHost.kind === "robots") return new NextResponse(PANEL_ROBOTS, { headers: { "Content-Type": "text/plain" } });

  if (!PUBLIC.some((r) => r.test(pathname))) {
    // neither public nor private: no such page (a mistyped or made-up URL), answered with the site's 404
    if (!needsSignIn(pathname)) return NextResponse.rewrite(new URL(NOT_FOUND_PAGE, req.url));
    // fail closed: without SESSION_SECRET configured nobody gets in
    const session = await verifySession(process.env.SESSION_SECRET, req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/login", req.url);
      if (pathname !== "/") login.searchParams.set("next", pathname + search);
      return NextResponse.redirect(login);
    }
  }

  // categories, brands and event pages: a fixed list, no database (their "moved" target already carries the query)
  const fixed = fixedRouteVerdict(pathname, req.nextUrl.searchParams);
  if (fixed?.kind === "moved") return NextResponse.redirect(new URL(fixed.to, req.url), 308);
  if (fixed?.kind === "missing" && isDocumentRequest(req.method, req.headers.get("accept"), req.nextUrl)) return NextResponse.rewrite(new URL(NOT_FOUND_PAGE, req.url));

  const verdict = await sitePageVerdict(req);
  if (verdict?.kind === "moved") return NextResponse.redirect(new URL(verdict.to + search, req.url), 308);
  if (verdict?.kind === "missing") return NextResponse.rewrite(new URL(NOT_FOUND_PAGE, req.url));

  const res = NextResponse.next();
  // private panel (and the rest): keep it out of search engines; the public site is meant to be found
  if (role === "panel" || !SITE.some((r) => r.test(pathname))) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
