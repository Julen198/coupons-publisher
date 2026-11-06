import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// The public deals site: indexable, open to everyone
const SITE = [/^\/$/, /^\/entrar(\/(confirmar|nombre))?$/, /^\/compartir$/, /^\/cuenta$/, /^\/chollos\/[^/]+$/, /^\/chollos\/[^/]+\/opengraph-image/, /^\/tiendas(\/[^/]+)?$/, /^\/calendario$/, /^\/(metodologia|aviso-de-afiliacion|contacto)$/, /^\/sitemap\.xml$/];
// Reachable without signing in: the public site, login, accepting an invitation, and what publishers embed on their sites
const PUBLIC = [...SITE, /^\/login$/, /^\/login\/magic$/, /^\/invite\//, /^\/p\//, /^\/go\//, /^\/widget\.js$/, /^\/robots\.txt$/, /^\/icon\.svg$/, /^\/store-logo\//,
  // Telegram webhook and its daily cron: each checks its own secret header instead of a session
  /^\/api\/telegram(\/cron)?$/];

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

  const res = NextResponse.next();
  // private panel (and the rest): keep it out of search engines; the public site is meant to be found
  if (!SITE.some((r) => r.test(pathname))) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
