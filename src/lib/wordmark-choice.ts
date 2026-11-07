// A store's wordmark: its full logo, letters included, for the landscape boxes (Chollometro style). Pure: finding
// candidates on the home page and choosing among the downloaded ones. Fetching is in wordmark-fetch.ts.
// The square icon (logo-choice.ts) stays for the tiny header icon and as the fallback.
import { httpsUrl, isUnsafeSvg, schemaLogos, tagAttr } from "./logo-choice.ts";

export type WordmarkSource = "schema" | "og:logo" | "header" | "icon-svg" | "manual";

export interface WordmarkCandidate {
  url: string; // for an inline SVG: the page address plus #inline-svg-<n> (shown on the review page only)
  source: WordmarkSource;
  inlineSvg?: string; // a standalone SVG document taken from the page itself
}

const MAX_HEADER_CANDIDATES = 4;
const TOP_OF_BODY = 60 * 1024; // no <header>: the logo sits near the top of the page
const RASTER_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];
const RASTER_MIN_RATIO = 1.8;
const RASTER_MIN_WIDTH = 120;
const RASTER_MIN_HEIGHT = 24;
const SVG_MIN_RATIO = 1.5; // compact lockups (symbol beside the name) still read in a 2.4:1 box
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const hasLogoWord = (...values: (string | undefined)[]) => values.some((v) => !!v && /logo/i.test(v));

// A standalone SVG from markup cut out of a page: namespaces added; null when unsafe (see isUnsafeSvg) or when it
// draws a sprite defined elsewhere in the page (<use href="#id"> without that id inside: it would render empty)
export function inlineSvgDocument(markup: string): string | null {
  let svg = markup.trim();
  if (!/^<svg\b/i.test(svg)) return null;
  if (!/^<svg\b[^>]*\sxmlns\s*=/i.test(svg)) svg = svg.replace(/^<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  if (/xlink:/i.test(svg) && !/^<svg\b[^>]*\sxmlns:xlink\s*=/i.test(svg)) svg = svg.replace(/^<svg\b/i, `<svg xmlns:xlink="${XLINK_NS}"`);
  const ids = new Set([...svg.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const uses = [...svg.matchAll(/<use\b[^>]*\s(?:xlink:)?href\s*=\s*["']#([^"']+)["']/gi)].map((m) => m[1]);
  if (uses.some((id) => !ids.has(id))) return null;
  return isUnsafeSvg(svg) ? null : svg;
}

// An <img>'s real picture: src, unless it's a lazy-loading placeholder (data: but not SVG), then data-src & co.
function imgSource(tag: string, pageUrl: string, allowHttp: boolean): { url?: string; inlineSvg?: string } {
  const src = (tagAttr(tag, "src") ?? "").trim();
  const svgData = /^data:image\/svg\+xml(;base64)?,([\s\S]*)$/i.exec(src);
  if (svgData) {
    try {
      const text = svgData[1] ? Buffer.from(svgData[2], "base64").toString("utf8") : decodeURIComponent(svgData[2]);
      const doc = inlineSvgDocument(text);
      return doc ? { inlineSvg: doc } : {};
    } catch {
      return {};
    }
  }
  const lazy = ["data-src", "data-lazy-src", "data-original"].map((a) => tagAttr(tag, a)).find(Boolean);
  const srcset = tagAttr(tag, "srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
  const href = src && !src.startsWith("data:") ? src : lazy ?? srcset;
  return { url: httpsUrl(href, pageUrl, allowHttp) };
}

// The page's header (or the top of its body): logo <img>s and inline <svg>s, in document order. A picture counts when
// its class/id/alt/src/aria-label/title says "logo", or when it sits inside a link that does.
function headerCandidates(region: string, pageUrl: string, allowHttp: boolean): WordmarkCandidate[] {
  const found: WordmarkCandidate[] = [];
  let inLogoLink = false;
  let inline = 0;
  for (const [token] of region.matchAll(/<a\b[^>]*>|<\/a\s*>|<img\b[^>]*>|<svg\b[\s\S]*?<\/svg\s*>/gi)) {
    if (/^<\/a/i.test(token)) inLogoLink = false;
    else if (/^<a\b/i.test(token)) inLogoLink = hasLogoWord(...["class", "id", "aria-label", "title"].map((a) => tagAttr(token, a)));
    else if (/^<img\b/i.test(token)) {
      const { url, inlineSvg } = imgSource(token, pageUrl, allowHttp);
      const named = hasLogoWord(...["class", "id", "alt", "aria-label", "title"].map((a) => tagAttr(token, a)), url);
      if (!(inLogoLink || named)) continue;
      if (inlineSvg) found.push({ url: `${pageUrl}#inline-svg-${++inline}`, source: "header", inlineSvg });
      else if (url) found.push({ url, source: "header" });
    } else {
      const open = /^<svg\b[^>]*>/i.exec(token)?.[0] ?? "";
      if (!(inLogoLink || hasLogoWord(...["class", "id", "aria-label"].map((a) => tagAttr(open, a))))) continue;
      const doc = inlineSvgDocument(token);
      if (doc) found.push({ url: `${pageUrl}#inline-svg-${++inline}`, source: "header", inlineSvg: doc });
    }
  }
  return found;
}

function headerRegions(html: string): string[] {
  const header = /<header\b[\s\S]*?<\/header\s*>/i.exec(html)?.[0];
  const bodyAt = html.search(/<body\b/i);
  const top = html.slice(Math.max(0, bodyAt), Math.max(0, bodyAt) + TOP_OF_BODY);
  return header ? [header, top] : [top];
}

// A home page's wordmark candidates, most trusted first: schema.org Organization/Brand logo, og:logo, the logo
// pictures in its header (the first few), and an SVG favicon (kept later only if wide). https only.
export function htmlWordmarkCandidates(html: string, pageUrl: string, allowHttp = false): WordmarkCandidate[] {
  const abs = (href: unknown) => httpsUrl(href, pageUrl, allowHttp);
  const listed = (source: WordmarkSource) => (url: string | undefined): WordmarkCandidate[] => (url ? [{ url, source }] : []);
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const ogLogo = metas.filter((t) => /^og:logo$/i.test(tagAttr(t, "property") ?? tagAttr(t, "name") ?? "")).map((t) => abs(tagAttr(t, "content")));
  const svgIcons = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => (tagAttr(t, "rel") ?? "").toLowerCase().split(/\s+/).includes("icon"))
    .filter((t) => /svg/i.test(tagAttr(t, "type") ?? "") || /\.svg(\?|$)/i.test(tagAttr(t, "href") ?? ""))
    .map((t) => abs(tagAttr(t, "href")));
  const header = headerRegions(html)
    .map((region) => headerCandidates(region, pageUrl, allowHttp))
    .find((list) => list.length) ?? [];
  const all = [
    ...schemaLogos(html).map(abs).flatMap(listed("schema")),
    ...ogLogo.flatMap(listed("og:logo")),
    ...header.slice(0, MAX_HEADER_CANDIDATES * 2),
    ...svgIcons.flatMap(listed("icon-svg")),
  ];
  const seen = new Set<string>();
  const unique = all.filter((c) => !seen.has(c.url) && seen.add(c.url));
  let headers = 0;
  return unique.filter((c) => c.source !== "header" || ++headers <= MAX_HEADER_CANDIDATES);
}

interface Shaped {
  width: number;
  height: number;
  type: string;
}

// Wide enough to be a name, not a symbol: SVGs at least 1.5:1; rasters at least 1.8:1 and 120×24 px
export function isWordmarkShape(c: Shaped): boolean {
  if (!(c.width > 0 && c.height > 0)) return false;
  if (c.type === "image/svg+xml") return c.width >= SVG_MIN_RATIO * c.height;
  return RASTER_TYPES.includes(c.type) && c.width >= RASTER_MIN_RATIO * c.height && c.width >= RASTER_MIN_WIDTH && c.height >= RASTER_MIN_HEIGHT;
}

// The first wide SVG (candidates come most trusted first), else the largest wide raster, else null
export function chooseWordmark<T extends Shaped>(downloaded: readonly T[]): T | null {
  const ok = downloaded.filter(isWordmarkShape);
  const svg = ok.find((c) => c.type === "image/svg+xml");
  if (svg) return svg;
  return [...ok].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}
