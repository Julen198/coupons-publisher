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
