// Which of a store's icons to show as its logo. Pure: parsing a home page / web manifest for candidates and
// choosing among the downloaded ones (real sizes). Fetching is in logo-fetch.ts.

export type LogoSource = "manifest" | "apple-touch-icon" | "icon" | "og:logo" | "schema" | "google";
// Most trusted first: icons made to be seen as an app tile, then page icons, brand logos, and Google's favicon cache
export const SOURCE_ORDER: readonly LogoSource[] = ["manifest", "apple-touch-icon", "icon", "og:logo", "schema", "google"];
export const LOGO_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export interface LogoCandidate {
  url: string;
  width: number; // real pixels once downloaded; declared (0 = unknown) while only listed
  height: number;
  type: string; // "" while unknown
  source: LogoSource;
  sha256?: string;
}

const MIN_SIDE = 64; // smaller than this reads as a smudge in a 112px tile
const GOOD_SIDE = 128;
const GOOGLE_MIN_SIDE = 128; // Google scales up 16px favicons: below 128 it's not a real big icon
const SQUAREISH = 1.3;

const isSvg = (c: { type: string }) => c.type === "image/svg+xml";
const squareish = (c: { width: number; height: number }) => Math.max(c.width, c.height) <= SQUAREISH * Math.min(c.width, c.height);
const minSide = (c: LogoCandidate) => (isSvg(c) ? Infinity : Math.min(c.width, c.height));
const maxSide = (c: LogoCandidate) => (isSvg(c) ? Infinity : Math.max(c.width, c.height));
const rank = (c: LogoCandidate) => SOURCE_ORDER.indexOf(c.source);

function usable(c: LogoCandidate, placeholders: ReadonlySet<string>): boolean {
  if (!LOGO_TYPES.includes(c.type) || !(c.width > 0 && c.height > 0)) return false;
  if (c.sha256 && placeholders.has(c.sha256)) return false;
  if (c.source === "google" && minSide(c) < GOOGLE_MIN_SIDE) return false;
  return maxSide(c) >= MIN_SIDE;
}

// The best logo among downloaded candidates, or null:
// 1. a square-ish SVG or ≥128px raster, from the first source (SOURCE_ORDER) that has one, the largest there;
// 2. else the remaining usable ones (≥64px), square-ish first, then the largest.
export function chooseLogo<T extends LogoCandidate>(candidates: readonly T[], placeholders: ReadonlySet<string> = new Set()): T | null {
  const ok = candidates.filter((c) => usable(c, placeholders));
  const good = ok.filter((c) => squareish(c) && minSide(c) >= GOOD_SIDE);
  if (good.length) return [...good].sort((a, b) => rank(a) - rank(b) || minSide(b) - minSide(a))[0];
  return [...ok].sort((a, b) => Number(squareish(b)) - Number(squareish(a)) || maxSide(b) - maxSide(a) || rank(a) - rank(b))[0] ?? null;
}

// Does the proposed logo have more pixels than the current one? (SVG beats any raster; SVG is never replaced)
export function isBetterLogo(current: { width: number; height: number; type: string } | null, proposed: { width: number; height: number; type: string }): boolean {
  if (!current) return true;
  if (isSvg(current)) return false;
  if (isSvg(proposed)) return true;
  return proposed.width * proposed.height > current.width * current.height;
}

// ---- Parsing ----

const tagAttr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
const httpsUrl = (href: unknown, base: string, allowHttp = false): string | undefined => {
  if (typeof href !== "string") return undefined;
  const clean = href.trim().replace(/&amp;/g, "&");
  if (!clean || !URL.canParse(clean, base)) return undefined;
  const u = new URL(clean, base);
  return u.protocol === "https:" || (allowHttp && u.protocol === "http:") ? u.href : undefined;
};
// "16x16 512x512" → 512 (any = scalable: 0, unknown)
const declaredSide = (sizes: string | undefined) => Math.max(0, ...(sizes ?? "").split(/\s+/).map((s) => Number(s.toLowerCase().split("x")[0]) || 0));
const listed = (url: string, source: LogoSource, side = 0, type = ""): LogoCandidate => ({ url, width: side, height: side, type, source });

const ORG_TYPES = /^(Organization|Corporation|OnlineStore|OnlineBusiness|Store|LocalBusiness|Brand)$/;

function schemaLogos(html: string): unknown[] {
  const found: unknown[] = [];
  // anywhere in the block: @graph lists, a WebSite's "publisher", an Offer's "seller"...
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []);
    if (types.some((t) => typeof t === "string" && ORG_TYPES.test(t)) && o.logo) {
      found.push(typeof o.logo === "object" && o.logo !== null ? (o.logo as { url?: unknown }).url : o.logo);
    }
    for (const [k, v] of Object.entries(o)) if (k !== "logo") visit(v, depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]), 0);
    } catch {
      // not JSON: skip that block
    }
  }
  return found;
}

// A home page's icon/logo candidates (declared sizes) in source order, and its web manifest's address.
// https URLs only (allowHttp: for tests against a local server).
export function htmlLogoCandidates(html: string, pageUrl: string, allowHttp = false): { candidates: LogoCandidate[]; manifestUrl?: string } {
  const abs = (href: unknown) => httpsUrl(href, pageUrl, allowHttp);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const rel = (t: string) => (tagAttr(t, "rel") ?? "").toLowerCase().split(/\s+/);
  const fromLinks = (test: (r: string[]) => boolean, source: LogoSource) =>
    links.filter((t) => test(rel(t))).flatMap((t) => {
      const url = abs(tagAttr(t, "href"));
      return url ? [listed(url, source, declaredSide(tagAttr(t, "sizes")), (tagAttr(t, "type") ?? "").toLowerCase())] : [];
    });
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const ogLogo = metas.filter((t) => /^og:logo$/i.test(tagAttr(t, "property") ?? tagAttr(t, "name") ?? "")).map((t) => abs(tagAttr(t, "content")));
  const origin = new URL(pageUrl).origin;
  const all = [
    ...fromLinks((r) => r.some((x) => x.startsWith("apple-touch-icon")), "apple-touch-icon"),
    ...fromLinks((r) => r.includes("icon"), "icon"),
    ...ogLogo.flatMap((url) => (url ? [listed(url, "og:logo")] : [])),
    ...schemaLogos(html).flatMap((href) => {
      const url = abs(href);
      return url ? [listed(url, "schema")] : [];
    }),
    ...(abs(`${origin}/apple-touch-icon.png`) ? [listed(`${origin}/apple-touch-icon.png`, "apple-touch-icon")] : []),
  ];
  const seen = new Set<string>();
  const candidates = all.filter((c) => !seen.has(c.url) && seen.add(c.url));
  const manifest = links.find((t) => rel(t).includes("manifest"));
  return { candidates, manifestUrl: manifest ? abs(tagAttr(manifest, "href")) : undefined };
}

// A web manifest's icons (declared sizes), skipping monochrome-only ones (meant to be tinted, not shown)
export function manifestLogoCandidates(json: string, manifestUrl: string, allowHttp = false): LogoCandidate[] {
  let icons: unknown;
  try {
    icons = (JSON.parse(json) as { icons?: unknown }).icons;
  } catch {
    return [];
  }
  if (!Array.isArray(icons)) return [];
  return icons.flatMap((i: { src?: unknown; sizes?: unknown; type?: unknown; purpose?: unknown }) => {
    if (typeof i?.purpose === "string" && i.purpose.trim().split(/\s+/).every((p) => p === "monochrome")) return [];
    const url = httpsUrl(i?.src, manifestUrl, allowHttp);
    return url ? [listed(url, "manifest", declaredSide(typeof i.sizes === "string" ? i.sizes : ""), typeof i.type === "string" ? i.type.toLowerCase() : "")] : [];
  });
}

// SVGs are only kept when they can't run or load anything (even though <img> and our route's CSP block both)
export function isUnsafeSvg(text: string): boolean {
  if (!/<svg\b/i.test(text)) return true;
  return (
    /<(script|foreignObject|iframe|embed|object|handler|listener)\b/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text) ||
    /javascript:|<!ENTITY/i.test(text) ||
    /\s(xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(png|jpeg|webp|gif);)/i.test(text)
  );
}
