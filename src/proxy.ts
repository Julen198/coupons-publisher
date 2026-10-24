import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Reachable without signing in: login, accepting an invitation, and what publishers embed on their sites
const PUBLIC = [/^\/login$/, /^\/invite\//, /^\/p\//, /^\/go\//, /^\/widget\.js$/, /^\/robots\.txt$/, /^\/icon\.svg$/];

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
  res.headers.set("X-Robots-Tag", "noindex, nofollow"); // private panel: keep it out of search engines
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
