import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { dealRoute, storeRoute } from "@/lib/route-lookup";
import { isDocumentRequest, type RouteVerdict } from "@/lib/site-routes";
import { orNullAfter } from "@/lib/with-timeout";

// The public deals site: indexable, open to everyone
const SITE = [/^\/$/, /^\/entrar(\/(confirmar|nombre))?$/, /^\/compartir$/, /^\/cuenta$/, /^\/chollos\/[^/]+$/, /^\/chollos\/[^/]+\/opengraph-image/, /^\/tiendas(\/[^/]+)?$/, /^\/calendario$/, /^\/(metodologia|aviso-de-afiliacion|contacto|no-encontrado)$/, /^\/sitemap\.xml$/];
// Reachable without signing in: the public site, login, accepting an invitation, and what publishers embed on their sites
const PUBLIC = [...SITE, /^\/login$/, /^\/login\/magic$/, /^\/invite\//, /^\/p\//, /^\/go\//, /^\/widget\.js$/, /^\/robots\.txt$/, /^\/icon\.svg$/, /^\/store-logo\//,
  // Telegram webhook and its daily cron: each checks its own secret header instead of a session
  /^\/api\/telegram(\/cron)?$/];

const DEAL_PAGE = /^\/chollos\/([^/]+)$/;
const STORE_PAGE = /^\/tiendas\/([^/]+)$/;
// Rendered by src/app/(site)/no-encontrado: a route that only calls notFound(), so it answers with a real 404
const NOT_FOUND_PAGE = "/no-encontrado";
// Past this the request goes on to the page, which runs the same checks itself
const ROUTE_LOOKUP_TIMEOUT_MS = 1200;

// Deal and store pages stream behind the site layout's Suspense, which fixes a 200 before the page can call notFound()
// or permanentRedirect(). Deciding here keeps the HTTP status honest. Only HTML document requests need it: RSC
// navigations and prefetches pass through (their links come from the database), and a failed lookup lets the request
// through to the page, which runs the same checks.
async function sitePageVerdict(req: NextRequest): Promise<RouteVerdict | null> {
  if (!isDocumentRequest(req.method, req.headers.get("accept"), req.nextUrl)) return null;
  const { pathname } = req.nextUrl;
  const deal = DEAL_PAGE.exec(pathname);
  const store = deal ? null : STORE_PAGE.exec(pathname);
  if (!deal && !store) return null;
  let slug = "";
  if (store) {
    try {
      slug = decodeURIComponent(store[1]);
    } catch {
      return { kind: "missing" }; // malformed %-escape: no store can have it
    }
  }
  // A stalled pooler must not hold every deal and store page for postgres.js's 30 s connect timeout
  return orNullAfter(deal ? dealRoute(deal[1]) : storeRoute(slug), ROUTE_LOOKUP_TIMEOUT_MS, (e) =>
    console.error("[proxy] route lookup failed", pathname, e),
  );
}

// First gate only (signature check, no DB). Pages and actions re-check the user, role and session version.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (!PUBLIC.some((r) => r.test(pathname))) {
    // fail closed: without SESSION_SECRET configured nobody gets in
    const session = await verifySession(process.env.SESSION_SECRET, req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/login", req.url);
      if (pathname !== "/") login.searchParams.set("next", pathname + search);
      return NextResponse.redirect(login);
    }
  }

  const verdict = await sitePageVerdict(req);
  if (verdict?.kind === "moved") return NextResponse.redirect(new URL(verdict.to + search, req.url), 308);
  if (verdict?.kind === "missing") return NextResponse.rewrite(new URL(NOT_FOUND_PAGE, req.url));

  const res = NextResponse.next();
  // private panel (and the rest): keep it out of search engines; the public site is meant to be found
  if (!SITE.some((r) => r.test(pathname))) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
