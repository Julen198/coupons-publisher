// A store's square brand icon for lists (apple-touch-icon first: square, made to be seen small).
// Stored embedded (data: URI) so it doesn't depend on hotlinking and pages only link to /store-logo/<slug>.

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
const abs = (href: string | undefined, base: string) => {
  if (!href || href.startsWith("data:") || !URL.canParse(href.replace(/&amp;/g, "&"), base)) return undefined;
  const u = new URL(href.replace(/&amp;/g, "&"), base);
  return /^https?:$/.test(u.protocol) ? u.href : undefined;
};
const side = (tag: string) => Math.max(0, ...(attr(tag, "sizes") ?? "").split(/\s+/).map((s) => Number(s.split("x")[0]) || 0));

export function iconCandidates(html: string, pageUrl: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const rel = (t: string) => (attr(t, "rel") ?? "").toLowerCase();
  const touch = links.filter((t) => rel(t).includes("apple-touch-icon")).sort((a, b) => side(b) - side(a));
  const icons = links
    .filter((t) => /(^|\s)icon(\s|$)/.test(rel(t)) && (side(t) >= 48 || /svg/i.test(attr(t, "type") ?? attr(t, "href") ?? "")))
    .sort((a, b) => side(b) - side(a));
  const origin = new URL(pageUrl).origin;
  const found = [...touch, ...icons].map((t) => abs(attr(t, "href"), pageUrl));
  return [...new Set([...found, `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`].filter((u): u is string => !!u))];
}

// Biggest icons a web manifest lists (where sites keep their 192/512px ones)
export function manifestIcons(json: string, manifestUrl: string): string[] {
  let icons: unknown;
  try {
    icons = (JSON.parse(json) as { icons?: unknown }).icons;
  } catch {
    return [];
  }
  if (!Array.isArray(icons)) return [];
  return icons
    .filter((i): i is { src: string; sizes?: string } => typeof i?.src === "string")
    .sort((a, b) => side(` sizes="${b.sizes ?? ""}"`) - side(` sizes="${a.sizes ?? ""}"`))
    .map((i) => abs(i.src, manifestUrl))
    .filter((u): u is string => !!u);
}

// Pixel width of a PNG, ICO (its biggest entry) or JPEG; SVG scales to anything; 0 = unknown
export function imageSide(b: Uint8Array, type: string): number {
  if (type.includes("svg")) return Infinity;
  if (b[0] === 0x89 && b[1] === 0x50) return ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    const n = b[4] | (b[5] << 8);
    return Math.max(0, ...Array.from({ length: n }, (_, k) => b[6 + 16 * k] || 256));
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 8 < b.length && b[i] === 0xff; i += 2 + ((b[i + 2] << 8) | b[i + 3])) {
      if (b[i + 1] >= 0xc0 && b[i + 1] <= 0xc3) return (b[i + 7] << 8) | b[i + 8];
    }
  }
  return 0;
}

const UA = { "User-Agent": "Mozilla/5.0 (compatible; CuponLab/0.1)" };
const MAX_BYTES = 120_000;
const GOOD_SIDE = 96; // shown at ~30px, so 96px stays sharp on 3x screens

const get = (url: string | URL, ms: number) => fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });

// The biggest icon among the site's own (page links, manifest, usual paths) and, for sites that block bots,
// Google's and DuckDuckGo's favicon caches (404 when they have none). "" when nothing works.
export async function fetchStoreIcon(website: string): Promise<string> {
  if (!URL.canParse(website)) return "";
  const page = new URL(website);
  if (!/^https?:$/.test(page.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(page.hostname)) return "";
  const html = await get(page, 8_000).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const manifestUrl = abs([...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel\s*=\s*["']manifest["']/i.test(t))?.match(/\shref\s*=\s*["']([^"']*)["']/i)?.[1], page.href);
  const manifest = manifestUrl ? await get(manifestUrl, 5_000).then((r) => (r.ok ? r.text() : "")).catch(() => "") : "";
  const candidates = [
    ...new Set([
      ...manifestIcons(manifest, manifestUrl ?? page.href),
      ...iconCandidates(html, page.href),
      `https://www.google.com/s2/favicons?domain=${page.hostname}&sz=256`,
      `https://icons.duckduckgo.com/ip3/${page.hostname}.ico`,
    ]),
  ];
  let best = { side: -1, uri: "" };
  for (const url of candidates) {
    try {
      const r = await get(url, 5_000);
      const type = r.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!r.ok || !type.startsWith("image/")) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_BYTES) continue;
      const px = imageSide(bytes, type);
      if (px > best.side) best = { side: px, uri: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` };
      if (px >= GOOD_SIDE) break;
    } catch {
      // next candidate
    }
  }
  return best.uri;
}
