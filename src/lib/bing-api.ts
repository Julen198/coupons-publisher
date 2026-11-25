// Read-only Bing Webmaster Tools, with the API key in BING_WEBMASTER_API_KEY (Bing Webmaster → Ajustes → Acceso a API).
// The JSON endpoints (the SOAP/POX ones were retired on 31 Aug 2026). Bing's index is what ChatGPT and Copilot search.
// Plain fetch, no SDK.
import { SEARCH_SITE, type SearchRow } from "./google-api.ts";

export const BING_SITE = process.env.BING_SITE_URL || SEARCH_SITE;
const API = "https://ssl.bing.com/webmaster/api.svc/json";
const TIMEOUT_MS = 15_000;

const bingKey = (raw = process.env.BING_WEBMASTER_API_KEY): string => (raw ?? "").trim();
export const bingConfigured = (): boolean => /^[A-Za-z0-9]{16,}$/.test(bingKey());
// Why Bing can't be read: no key, or a value that doesn't look like one (pasted with spaces or quotes)
export const bingKeyProblem = (raw = process.env.BING_WEBMASTER_API_KEY): string =>
  !bingKey(raw) ? "sin clave" : /^[A-Za-z0-9]{16,}$/.test(bingKey(raw)) ? "" : "clave no válida";

// "/Date(1732003200000-0800)/" → "2024-11-19" (UTC day of the instant; Bing's rows fall on midnight Pacific)
export function bingDay(raw: unknown): string {
  const m = /\/Date\((-?\d+)/.exec(String(raw ?? ""));
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
}

async function get<T>(method: string): Promise<T[]> {
  const url = `${API}/${method}?${new URLSearchParams({ siteUrl: BING_SITE, apikey: bingKey() })}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const j = (await res.json().catch(() => ({}))) as { d?: T[]; Message?: string; ErrorCode?: number };
  // never echo the URL: it carries the key
  if (!res.ok || !Array.isArray(j.d)) throw new Error(`Bing ${method}: ${j.Message ?? res.status}`);
  return j.d;
}

export interface BingDay { day: string; clicks: number; impressions: number }
type RawTraffic = { Date?: string; Clicks?: number; Impressions?: number };
type RawQuery = { Date?: string; Query?: string; Clicks?: number; Impressions?: number; AvgImpressionPosition?: number; AvgClickPosition?: number };

export const rowsOfTraffic = (d: RawTraffic[]): BingDay[] =>
  d.map((r) => ({ day: bingDay(r.Date), clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0 })).filter((r) => r.day);

// Weekly buckets per query: Bing updates query stats once a week
export interface BingQueryWeek { day: string; query: string; clicks: number; impressions: number; position: number }
export const rowsOfQueries = (d: RawQuery[]): BingQueryWeek[] =>
  d.map((r) => ({ day: bingDay(r.Date), query: (r.Query ?? "").trim().toLowerCase(), clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0, position: r.AvgImpressionPosition ?? -1 }))
    .filter((r) => r.day && r.query);

// The weeks that end inside [start, end], summed per query, as Search Console rows (position weighted by impressions;
// Bing gives -1 when it has none). A range shorter than a week can hold no bucket at all: then [].
export function queriesBetween(rows: readonly BingQueryWeek[], start: string, end: string): SearchRow[] {
  const by = new Map<string, { clicks: number; impressions: number; posW: number; posN: number }>();
  for (const r of rows) {
    if (r.day < start || r.day > end) continue;
    const q = by.get(r.query) ?? { clicks: 0, impressions: 0, posW: 0, posN: 0 };
    q.clicks += r.clicks;
    q.impressions += r.impressions;
    if (r.position > 0) { q.posW += r.position * r.impressions; q.posN += r.impressions; }
    by.set(r.query, q);
  }
  return [...by].map(([query, q]) => ({ keys: [query], clicks: q.clicks, impressions: q.impressions, position: q.posN ? q.posW / q.posN : 0 }));
}

// Daily clicks and impressions of the whole site (GetRankAndTrafficStats), about six months back
export const bingTraffic = async (): Promise<BingDay[]> => rowsOfTraffic(await get<RawTraffic>("GetRankAndTrafficStats"));
// Weekly stats of the top queries (GetQueryStats), about six months back
export const bingQueries = async (): Promise<BingQueryWeek[]> => rowsOfQueries(await get<RawQuery>("GetQueryStats"));
