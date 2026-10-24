// Pulls the bits of a publisher's homepage we need to dress the demo like their site.
// ponytail: regex over raw HTML, no DOM parser — good enough for meta tags/nav; misses JS-rendered menus
export type Disguise = {
  name?: string;
  logoUrl?: string;
  color?: string;
  nav?: string[];
  font?: "serif" | "sans";
  fontFamily?: string; // their web font, e.g. "Montserrat" (loaded from Google Fonts in the demo when it exists there)
  layout?: "newspaper" | "store"; // centred masthead with date, or shop header: logo left + search + icons
  guessed?: boolean; // their site blocked us: filled from what the model knows of the brand, needs a human look
};

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

const MARKS: Record<string, string> = { acute: "\u0301", grave: "\u0300", uml: "\u0308", circ: "\u0302", tilde: "\u0303", cedil: "\u0327" };

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    // &aacute; &ntilde; &uuml; &ccedil;… = letter + combining mark
    .replace(/&([a-z])(acute|grave|uml|circ|tilde|cedil);/gi, (_, l, m) => (l + MARKS[m]).normalize("NFC"))
    .replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, "");

// Pages still served as ISO-8859-x: honour the charset from the header or a <meta>, else UTF-8 like browsers do.
export function decodeHtml(buf: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
  const charset = contentType?.match(/charset=["']?([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder().decode(buf); // unknown label
  }
}

const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function absolute(src: string | undefined, base: string) {
  if (!src) return undefined;
  try {
    const u = new URL(decode(src), base);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function meta(html: string, key: string) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, "i"))?.[0];
  return tag ? attr(tag, "content") : undefined;
}

function hexColor(c: string | undefined) {
  const m = c?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

// header/nav markup only: logo-ish images elsewhere are club/partner/sponsor badges
// a declared width ≤ 48px is an icon/badge (30×30 club crests in sports headers), never a masthead logo
const isLogoImg = (tag: string) => /logo/i.test(tag) && !(Number(attr(tag, "width")) <= 48);

const headerBlocks = (html: string) =>
  [...html.matchAll(/<(nav|header)\b[\s\S]*?<\/\1>/gi)].slice(0, 3).map((m) => m[0]).join("");

function findLogo(html: string, base: string) {
  const img = [...headerBlocks(html).matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).find(isLogoImg);
  const src = img && (attr(img, "src") ?? attr(img, "data-src"));
  if (src && !src.startsWith("data:")) return absolute(src, base);
  const icon = html.match(/<link[^>]+rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i)?.[0];
  return absolute(icon && attr(icon, "href"), base);
}

function findNav(html: string) {
  const block = html.match(/<nav\b[\s\S]*?<\/nav>/i)?.[0] ?? html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? "";
  const items = [...block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => text(m[1]));
  return [...new Set(items.filter((t) => t.length >= 2 && t.length <= 24))].slice(0, 8);
}

export function extractDisguise(html: string, baseUrl: string): Disguise {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  // site names often carry a tagline ("www.x.es - Últimas noticias"): keep the part before the separator
  const raw = meta(html, "og:site_name") ?? (title ? text(title) : undefined);
  const name = raw ? decode(raw).split(/\s[|\-–—:]\s/)[0].replace(/^www\./i, "").trim() : undefined;
  const nav = findNav(html);
  return {
    name: name || undefined,
    logoUrl: findLogo(html, baseUrl),
    color: hexColor(meta(html, "theme-color")) ?? hexColor(meta(html, "msapplication-TileColor")),
    nav: nav.length ? nav : undefined,
  };
}

// near-white, near-black and greys are page chrome, never the brand colour
function isGrey(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 16;
}

const top = (items: string[], n: number) =>
  [...items.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, n);

// Compact summary of a homepage for the model: a few KB instead of the raw 300 KB+ of HTML.
export function siteDigest(html: string, baseUrl: string, css = ""): { text: string; logos: string[] } {
  const noScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const blocks = headerBlocks(noScripts);
  const brand = (meta(noScripts, "og:site_name") ?? "").trim().toLowerCase();
  const imgAt = (t: string, why: string) => ({ src: absolute(attr(t, "src") ?? attr(t, "data-src"), baseUrl), alt: decode(attr(t, "alt") ?? why) });
  // header logos, then any image named after the brand (e.g. a footer wordmark when the header logo is an inline <svg>)
  const headerLogos = [...blocks.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter(isLogoImg);
  const brandImgs = brand.length >= 3
    ? [...noScripts.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter((t) => decode(attr(t, "alt") ?? "").trim().toLowerCase() === brand && !(Number(attr(t, "width")) <= 48))
    : [];
  const icon = noScripts.match(/<link[^>]+rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i)?.[0];
  const candidates = [
    ...headerLogos.map((t) => imgAt(t, "logo de cabecera")),
    ...brandImgs.map((t) => imgAt(t, "imagen con el nombre de la marca")),
    { src: absolute(meta(noScripts, "og:image"), baseUrl), alt: "og:image" },
    { src: absolute(icon && attr(icon, "href"), baseUrl), alt: "icono de la web" },
  ]
    // logos are SVG/PNG/WebP; JPEGs are photos (promos, article images)
    .filter((l): l is { src: string; alt: string } => !!l.src && !l.src.startsWith("data:") && !/\.jpe?g(\?|$)/i.test(l.src))
    .filter((l, i, all) => all.findIndex((x) => x.src === l.src) === i)
    .slice(0, 6);
  const links = [...new Set([...blocks.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => text(m[1])))]
    .filter((t) => t.length >= 2 && t.length <= 30)
    .slice(0, 40);
  const styles = noScripts + "\n" + css;
  const colours = [...styles.matchAll(/[:\s,(]#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)]
    .map((m) => hexColor(`#${m[1]}`))
    .filter((c): c is string => !!c && !isGrey(c));
  const fonts = [...styles.matchAll(/font-family\s*:\s*([^;}<]+)/gi)].map((m) => decode(m[1]).trim().slice(0, 80));
  const search = /<input\b[^>]*(type\s*=\s*["']search|placeholder\s*=\s*["'][^"']*busca)/i.test(blocks);
  const title = noScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const summary = [
    `URL: ${baseUrl}`,
    `Título: ${title ? decode(text(title)) : "-"}`,
    `og:site_name: ${meta(noScripts, "og:site_name") ?? "-"}`,
    `theme-color: ${meta(noScripts, "theme-color") ?? "-"}`,
    `Logos candidatos:\n${candidates.map((l) => `- ${l.src} (${l.alt})`).join("\n") || "-"}`,
    `Buscador en la cabecera: ${search ? "sí" : "no"}`,
    `Enlaces de cabecera y menú: ${links.join(" | ") || "-"}`,
    `Colores en su CSS (veces): ${top(colours, 12).map(([c, n]) => `${c} ×${n}`).join(", ") || "-"}`,
    `Tipografías (más usadas primero): ${top(fonts, 6).map(([f]) => f).join(" / ") || "-"}`,
  ].join("\n");
  return { text: summary, logos: candidates.map((l) => l.src) };
}

// The model's answer is untrusted: keep only values that pass the same checks as the regex path.
export function cleanDisguise(raw: Omit<Disguise, "guessed">, fallback: Disguise, logos: string[]): Disguise {
  const color = hexColor(raw.color);
  const nav = [...new Set((raw.nav ?? []).map((n) => n.trim()).filter((n) => n.length >= 2 && n.length <= 24))].slice(0, 8);
  return {
    name: raw.name?.trim() || fallback.name,
    // only a URL we actually saw on the page; the model must not invent one
    logoUrl: raw.logoUrl && logos.includes(raw.logoUrl) ? raw.logoUrl : fallback.logoUrl,
    color: color && !isGrey(color) ? color : fallback.color,
    nav: nav.length ? nav : fallback.nav,
    font: raw.font === "sans" || raw.font === "serif" ? raw.font : fallback.font,
    fontFamily: cleanFontFamily(raw.fontFamily) ?? fallback.fontFamily,
    layout: raw.layout === "store" || raw.layout === "newspaper" ? raw.layout : fallback.layout,
  };
}

const GENERIC_FONTS = new Set(["serif", "sans serif", "sans-serif", "system ui", "inherit", "initial", "monospace", "cursive"]);

// Font names end up in CSS and a Google Fonts URL: letters, digits and spaces only
export function cleanFontFamily(name: string | undefined): string | undefined {
  const n = name?.trim().replace(/^["']|["']$/g, "") ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/.test(n) && !GENERIC_FONTS.has(n.toLowerCase()) ? n : undefined;
}

// Some brands only expose a white wordmark (made for a dark footer, sometimes at 25% opacity).
// We repaint it dark and embed it as a data: URI so it shows on the demo's white header (and dodges hotlink blocks).
const SVG_DATA = "data:image/svg+xml;base64,";
export const MAX_SVG_LOGO = 20_000;

export const isSvgUrl = (url: string) => URL.canParse(url) && new URL(url).pathname.toLowerCase().endsWith(".svg");

export function isWhiteSvg(svg: string): boolean {
  const paints = [...svg.matchAll(/(?:fill|stroke)\s*[=:]\s*["']?\s*([#\w(),. ]+)/gi)]
    .map((m) => m[1].trim().toLowerCase())
    .filter((c) => !["none", "transparent", "currentcolor"].includes(c));
  return paints.length > 0 && paints.every((c) => ["white", "#fff", "#ffffff", "rgb(255,255,255)"].includes(c.replace(/\s/g, "")));
}

export function darkSvgDataUri(svg: string): string {
  const dark = svg
    .replace(/\b(fill|stroke)(\s*[=:]\s*["']?)\s*(white|#fff(?:fff)?|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, "$1$2#1a1a1a")
    .replace(/\s(?:fill-|stroke-)?opacity\s*=\s*["'][^"']*["']/gi, "");
  return SVG_DATA + Buffer.from(dark).toString("base64");
}

// A logo is an http(s) URL or one of our embedded SVGs; anything else (javascript:, data:text/html…) is refused
export function validLogo(v: string): boolean {
  if (v.startsWith(SVG_DATA)) return v.length <= MAX_SVG_LOGO * 1.4 && /^[A-Za-z0-9+/=]+$/.test(v.slice(SVG_DATA.length));
  return URL.canParse(v) && ["http:", "https:"].includes(new URL(v).protocol);
}
