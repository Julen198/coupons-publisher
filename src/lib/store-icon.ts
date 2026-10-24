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

const UA = { "User-Agent": "Mozilla/5.0 (compatible; TesseraCoupons/0.1)" };
const MAX_BYTES = 120_000;

// Fetches the first candidate that really is a small image. "" when none works (blocked site, no icon…).
export async function fetchStoreIcon(website: string): Promise<string> {
  if (!URL.canParse(website)) return "";
  const page = new URL(website);
  if (!/^https?:$/.test(page.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(page.hostname)) return "";
  const html = await fetch(page, { headers: UA, signal: AbortSignal.timeout(8_000) })
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  for (const url of iconCandidates(html, page.href)) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(5_000) });
      const type = r.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!r.ok || !type.startsWith("image/")) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 100 || bytes.length > MAX_BYTES) continue;
      return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch {
      // next candidate
    }
  }
  return "";
}
