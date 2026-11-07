// A deal's product photo from its landing page's Open Graph tags. Pure parsing and checks; fetching is in og-image-fetch.ts.
import { BlockList, isIP } from "node:net";
import { httpsImage } from "./networks/types.ts";

export interface OgImage {
  image: string; // absolute https URL
  type: string; // og:type as the page wrote it, "" when missing
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

// name → value for one tag's attributes (double, single or unquoted values)
function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out.set(m[1].toLowerCase(), decodeEntities((m[2] ?? m[3] ?? m[4] ?? "").trim()));
  }
  return out;
}

// In order of preference; the first one that is a valid https address wins
const IMAGE_KEYS = ["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"];

export function extractOgImage(html: string, pageUrl: string): OgImage | null {
  const meta = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.get("property") ?? a.get("name") ?? "").toLowerCase();
    const content = a.get("content") ?? "";
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  for (const key of IMAGE_KEYS) {
    const raw = meta.get(key);
    if (!raw || !URL.canParse(raw, pageUrl)) continue;
    const image = httpsImage(new URL(raw, pageUrl).href);
    if (image) return { image, type: meta.get("og:type") ?? "" };
  }
  return null;
}

const PRODUCT_TYPES = new Set(["product", "og:product", "product.item", "product.group"]);
const NOT_A_PHOTO = /logo|sprite|placeholder|default|banner/i;
// category, search and sale listings: their image is a collage or the site's, not one product
const LISTING_PATH = /\/(c|cat|category|categoria|categorias|categories|collections?|coleccion|colecciones|search|buscar|busqueda|ofertas|promociones|promos?|rebajas|sale|outlet|marcas?|brands?)(\/|$)/i;

const sameImage = (a: string, b: string) => (URL.canParse(a) && URL.canParse(b) ? new URL(a).href === new URL(b).href : a === b);

const fileName = (image: string) => {
  const last = new URL(image).pathname.split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

// Is this og:image a photo of the one product the landing page sells (not the shop's generic share picture)?
export function isProductImage(o: OgImage, landingUrl: string, homeImage: string | null): boolean {
  const file = fileName(o.image);
  if (NOT_A_PHOTO.test(file) || /\.svg$/i.test(file)) return false;
  if (PRODUCT_TYPES.has(o.type.trim().toLowerCase())) return true;
  const landing = new URL(landingUrl);
  if (landing.pathname.replace(/\/+$/, "") === "" || LISTING_PATH.test(landing.pathname)) return false;
  return !homeImage || !sameImage(o.image, homeImage);
}

// Affiliate redirect hosts: fetching one would count as a click, so they are never fetched
const TRACKING_HOST = /(^|\.)(awin1\.com|awin\.com|tradedoubler\.com|effiliation\.com|anrdoezrs\.net|dpbolvw\.net|jdoqocy\.com|kqzyfj\.com|tkqlhce\.com|emjcd\.com|linksynergy\.com|webgains\.com|sjv\.io|pxf\.io|ojrq\.net|prf\.hn|admitad\.com|lenkmio\.com|adtraction\.com|kwanko\.com|affilae\.com|netaffiliation\.com)$/i;

export const isTrackingLink = (url: string) => URL.canParse(url) && TRACKING_HOST.test(new URL(url).hostname);

// Private, loopback, link-local, CGNAT (Alibaba's metadata), multicast and unique-local ranges: never fetched (SSRF)
const BLOCKED = new BlockList();
for (const [net, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv4");
}
// IPv6: unspecified, loopback and IPv4-compatible (::/96), ULA, link-local, multicast, NAT64, and the tunnels that carry
// an IPv4 address inside (6to4 2002::/16, Teredo 2001::/32): a public-looking v6 must not reach a private v4
for (const [net, prefix] of [["::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2002::", 16], ["2001::", 32]] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv6");
}

// "::ffff:127.0.0.1" / "::ffff:7f00:1" → "127.0.0.1"
function mappedIpv4(ip: string): string | null {
  const m = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(ip);
  if (!m) return null;
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16);
  const lo = parseInt(m[3], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return BLOCKED.check(ip, "ipv4");
  if (v !== 6) return true;
  const v4 = mappedIpv4(ip);
  return v4 ? BLOCKED.check(v4, "ipv4") : BLOCKED.check(ip, "ipv6");
}
