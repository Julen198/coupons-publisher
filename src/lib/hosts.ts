// The panel and the public site on separate hosts (cms.cuponlab.com and www.cuponlab.com), decided in src/proxy.ts.
// Pure, so it tests without a request. With PANEL_URL unset (local dev, preview deployments) nothing changes: every
// host serves everything, as before.

// The panel's own pages: on the public host they move to the panel host
const PANEL_ONLY = /^\/(panel|login|invite|demo|demo-preview)(\/|$)/;
// Served on both hosts. /api: crons, webhooks and the panel's exports (each checks its own secret or session). /p, /go
// and widget.js: embedded on publishers' sites with whichever host the snippet carried, so old snippets keep working.
const SHARED = /^\/(api|p|go|store-logo)(\/|$)|^\/(widget\.js|icon\.svg|favicon\.ico)$/;

export type HostRole = "panel" | "site" | "any";

const hostOf = (url: string | undefined): string => {
  const raw = url?.trim();
  if (!raw || !URL.canParse(raw)) return "";
  return new URL(raw).host.toLowerCase();
};

// PANEL_URL, e.g. "https://cms.cuponlab.com"; "" when unset or invalid
export function panelOrigin(raw = process.env.PANEL_URL): string {
  const v = raw?.trim();
  return v && URL.canParse(v) ? new URL(v).origin : "";
}

// Which side a request's Host is on. With PANEL_URL set (production only), every host but the panel's is the public
// side, vercel.app addresses included, so the panel answers on one host alone. Preview deployments and local dev have
// no PANEL_URL and keep serving both.
export function hostRole(host: string | null, panelUrl: string | undefined, siteUrl: string | undefined): HostRole {
  const panel = hostOf(panelUrl);
  if (!panel || panel === hostOf(siteUrl) || !host) return "any";
  return host.toLowerCase() === panel ? "panel" : "site";
}

export type HostVerdict = { kind: "ok" } | { kind: "redirect"; to: string } | { kind: "robots" };

// What a path does on each host. The panel host only answers panel and shared paths, and sends the rest of the
// public site to its own host, so it never shows a copy of the site to search engines.
export function hostVerdict(role: HostRole, pathname: string, search: string, panelUrl: string, siteUrl: string): HostVerdict {
  if (role === "any" || SHARED.test(pathname)) return { kind: "ok" };
  if (role === "site") return PANEL_ONLY.test(pathname) ? { kind: "redirect", to: `${panelOrigin(panelUrl)}${pathname}${search}` } : { kind: "ok" };
  if (pathname === "/robots.txt") return { kind: "robots" };
  if (pathname === "/") return { kind: "redirect", to: `${panelOrigin(panelUrl)}/panel` };
  if (PANEL_ONLY.test(pathname)) return { kind: "ok" };
  return { kind: "redirect", to: `${new URL(siteUrl).origin}${pathname}${search}` };
}

// The panel host is never indexed
export const PANEL_ROBOTS = "User-agent: *\nDisallow: /\n";
