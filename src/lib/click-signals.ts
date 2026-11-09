import { createHash } from "node:crypto";

// What a click row keeps besides who and which coupon: pure, so it tests without a database (see recordClick).

export type ClickKind = "go" | "copy" | "untracked";

// Crawlers and link-preview fetchers follow links too; they are not readers
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|curl|wget|python-requests|httpclient|okhttp|axios|node-fetch|go-http-client|java\/|libwww|scrapy|phantomjs|lighthouse|pingdom|uptime|monitor/i;

// An empty user agent is a script, not a browser
export const isBot = (ua: string | null): boolean => !ua?.trim() || BOT_UA.test(ua);

// sha256 of user agent + Madrid day, first 16 hex chars: enough to tell repeats apart within a day, useless to identify
// anyone (no IP, nothing kept raw, changes every day)
export function uaHash(ua: string, day: string): string {
  return createHash("sha256").update(`${ua}\n${day}`).digest("hex").slice(0, 16);
}

// The page a click came from, as a path: no origin, query string or fragment (they can carry personal data), at most
// 200 characters. Accepts a full URL (the Referer header) or a path (the copy beacon); "" for anything else.
export function refPath(raw: string | null | undefined, ownOrigin?: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("/") && !s.startsWith("//")) return cleanPath(s.split(/[?#]/)[0]);
  if (!URL.canParse(s)) return "";
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) return "";
  // another site linking to /go: keep only its host, never its path
  if (ownOrigin && u.origin !== ownOrigin) return cleanPath(`ext:${u.hostname}`);
  return cleanPath(u.pathname);
}

const cleanPath = (p: string) => p.replace(/[^\w\-./:~%@]/g, "").slice(0, 200);

// Within this window the same browser (ua hash) on the same coupon and kind counts once: double clicks, reloads
export const DEDUPE_SECONDS = 30;

// How long clicks are kept: the cron in /api/clicks/cron deletes older ones (13 months and a bit, for year-on-year
// comparisons and the networks' late reports). Reading stats never deletes anything.
export const CLICK_RETENTION_DAYS = 400;

// The Ajustes choice (settings.click_retention_days) as days to keep, or null = keep all. Never under 400: an older
// shorter choice (90, 365) reads as 400.
export function retentionDays(setting: string | undefined): number | null {
  if (setting === "all") return null;
  const n = Number(setting);
  return Number.isFinite(n) && n > CLICK_RETENTION_DAYS ? Math.trunc(n) : CLICK_RETENTION_DAYS;
}

// ---- origin (clicks.source): where the click was made, so clicks can be counted per origin

// A source is a short lowercase word that starts with a letter ("portada", "tienda", "chollo", "pagina", "widget",
// "telegram", "seo"…): no hyphen, so it can close the network clickref ("<client>-<store>-<coupon>-<source>") and still
// be read back from it.
export const SOURCE_RE = /^[a-z][a-z0-9]{0,15}$/;

// What a link or campaign says about its origin (?o=, utm_source), cleaned to a source; "" when it isn't one
export function sourceParam(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return SOURCE_RE.test(s) ? s : "";
}

// The origin a click is stored with: what the link says (?o=), else what the page path it came from tells
// (see refPath), else "" (unknown: an old link, a stripped referrer)
export function clickSource(param: string | null | undefined, ref: string): string {
  const explicit = sourceParam(param);
  if (explicit) return explicit;
  if (!ref) return "";
  if (ref.startsWith("ext:")) return "externo";
  if (ref.startsWith("/chollos/")) return "chollo";
  if (ref.startsWith("/tiendas/")) return "tienda";
  if (ref.startsWith("/p/")) return "pagina";
  if (ref === "/") return "portada";
  return "web";
}

// "/go/x/1" + "tienda" → "/go/x/1?o=tienda"; an empty or invalid source leaves the address as it is
export function withSource(href: string, source: string): string {
  const s = sourceParam(source);
  return s ? `${href}${href.includes("?") ? "&" : "?"}o=${s}` : href;
}

// Panel labels for the sources CuponLab puts on its own links; any other source shows as written
export const SOURCE_LABEL: Record<string, string> = {
  "": "Sin origen",
  portada: "Portada de CuponLab",
  tienda: "Página de tienda",
  chollo: "Ficha de chollo",
  web: "Otras páginas de CuponLab",
  pagina: "Página del medio",
  widget: "Widget",
  telegram: "Telegram",
  externo: "Otra web",
};

// The origin of the clicks on one of our pages: the campaign it was reached from (?utm_source=telegram, seo…) when
// there is one, else the kind of page (`fallback`: "portada", "tienda", "chollo")
export function pageSource(sp: Record<string, string | string[] | undefined>, fallback: string): string {
  const utm = sp.utm_source;
  return sourceParam(typeof utm === "string" ? utm : "") || fallback;
}
