// Everything the Estadísticas page shows, from four sources: Search Console and GA4 (google-api.ts), our own clicks
// and copies (clicks table) and the automatic guides / AI costs. Each Google part fails on its own: the page still
// shows the rest and says what is missing.
import { sql } from "./db";
import { commissionsBetween, type CommissionTotals } from "./commissions";
import { guideSlugs } from "./store-guides.ts";
import { dateRange, ga4Report, googleConfigured, googleKeyProblem, meanPosition, searchAnalytics, storeSlugOf, type SearchRow } from "./google-api.ts";

export const STATS_RANGES = [7, 28, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export const rangeOf = (v: unknown): StatsRange => (STATS_RANGES.includes(Number(v) as StatsRange) ? (Number(v) as StatsRange) : 28);

export interface Totals { impressions: number; gClicks: number; position: number | null; visits: number | null; clicks: number; copies: number; earned: number; sales: number }
export interface DayPoint { day: string; visits: number; clicks: number }
export interface QueryRow { query: string; impressions: number; clicks: number; position: number }
export interface StoreStat { slug: string; name: string; guide: "published" | "scheduled" | "rejected" | "none"; impressions: number; position: number | null; visits: number; clicks: number; earned: number }
export interface SourceState { ok: boolean; note: string }

export interface Stats {
  range: ReturnType<typeof dateRange>; days: StatsRange;
  sources: { search: SourceState; ga4: SourceState; awin: SourceState };
  approved: number; // commissions of the period already approved by the network
  cur: Totals; prev: Totals;
  daily: DayPoint[]; origins: { source: string; clicks: number }[]; queries: QueryRow[]; stores: StoreStat[];
  guides: { published: number; scheduled: number; next: { name: string; at: Date } | null }; aiCost: number;
}

const days = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};

async function own(start: string, end: string) {
  const rows = await sql()<{ day: string; kind: string; source: string; store_id: number; n: number }[]>`
    SELECT to_char((at AT TIME ZONE 'Europe/Madrid')::date, 'YYYY-MM-DD') AS day, kind, source, store_id, count(*)::int AS n
    FROM clicks WHERE (at AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${start}::date AND ${end}::date
    GROUP BY 1, 2, 3, 4`;
  return rows.map((r) => ({ ...r }));
}

type Google = { search?: { cur: SearchRow[]; prev: SearchRow[]; queries: SearchRow[]; pages: SearchRow[] }; ga4?: { daily: Map<string, number>; prev: number; pages: Map<string, number> }; errors: { search?: string; ga4?: string } };

async function google(r: ReturnType<typeof dateRange>): Promise<Google> {
  const out: Google = { errors: {} };
  if (!googleConfigured()) return { errors: { search: googleKeyProblem(), ga4: googleKeyProblem() } };
  const [search, ga4] = await Promise.allSettled([
    Promise.all([
      searchAnalytics(r.start, r.end, ["date"]),
      searchAnalytics(r.prevStart, r.prevEnd, ["date"]),
      searchAnalytics(r.start, r.end, ["query"], 250),
      searchAnalytics(r.start, r.end, ["page"], 1000),
    ]),
    Promise.all([
      ga4Report(r.start, r.end, ["date"], ["sessions"]),
      ga4Report(r.prevStart, r.prevEnd, [], ["sessions"]),
      ga4Report(r.start, r.end, ["pagePath"], ["screenPageViews"], { dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/tiendas/" } } } }),
    ]),
  ]);
  if (search.status === "fulfilled") {
    const [cur, prev, queries, pages] = search.value;
    out.search = { cur, prev, queries, pages };
  } else out.errors.search = search.reason instanceof Error ? search.reason.message : "error";
  if (ga4.status === "fulfilled") {
    const [daily, prev, pages] = ga4.value;
    const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.ga4 = {
      daily: new Map(daily.map((x) => [iso(x.dims[0]), x.values[0]])),
      prev: prev[0]?.values[0] ?? 0,
      pages: pages.reduce((m, x) => { const s = storeSlugOf(x.dims[0]); return s ? m.set(s, (m.get(s) ?? 0) + x.values[0]) : m; }, new Map<string, number>()),
    };
  } else out.errors.ga4 = ga4.reason instanceof Error ? ga4.reason.message : "error";
  for (const [k, v] of Object.entries(out.errors)) console.error(`stats ${k} failed`, v);
  return out;
}

// ponytail: per-instance cache so reloading the page doesn't call Google each time; an hour is plenty for SEO data
const cache = new Map<string, { at: number; value: Google }>();
const CACHE_MS = 60 * 60 * 1000;

async function googleCached(r: ReturnType<typeof dateRange>): Promise<Google> {
  const key = `${r.start}:${r.end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await google(r);
  if (!value.errors.search && !value.errors.ga4) cache.set(key, { at: Date.now(), value });
  return value;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const isClick = (kind: string) => kind === "go" || kind === "untracked";

export async function loadStats(d: StatsRange): Promise<Stats> {
  const r = dateRange(d);
  const [g, cur, prev, stores, guides, [cost], money, prevMoney, [awin]] = await Promise.all([
    googleCached(r),
    own(r.start, r.end),
    own(r.prevStart, r.prevEnd),
    sql()<{ id: number; slug: string; name: string; guide: string | null }[]>`
      SELECT s.id, s.slug, s.name, g.status AS guide FROM stores s LEFT JOIN store_guides g ON g.store_id = s.id`,
    sql()<{ status: string; draft: boolean; name: string; publish_at: Date }[]>`
      SELECT g.status, g.draft IS NOT NULL AS draft, s.name, g.publish_at FROM store_guides g JOIN stores s ON s.id = g.store_id`,
    sql()<{ cost: number }[]>`SELECT coalesce(sum(cost_total), 0)::float AS cost FROM ai_usage WHERE (at AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${r.start}::date AND ${r.end}::date`,
    commissionsBetween(r.start, r.end),
    commissionsBetween(r.prevStart, r.prevEnd),
    sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM network_accounts WHERE network = 'awin'`,
  ]);
  const totals = (rows: typeof cur, search: SearchRow[] | undefined, visits: number | null, m: CommissionTotals): Totals => ({
    impressions: sum((search ?? []).map((x) => x.impressions)),
    gClicks: sum((search ?? []).map((x) => x.clicks)),
    position: search ? meanPosition(search) : null,
    visits,
    clicks: sum(rows.filter((x) => isClick(x.kind)).map((x) => x.n)),
    copies: sum(rows.filter((x) => x.kind === "copy").map((x) => x.n)),
    earned: m.earned,
    sales: m.sales,
  });
  const daily = days(r.start, r.end).map((day) => ({
    day,
    visits: g.ga4?.daily.get(day) ?? 0,
    clicks: sum(cur.filter((x) => x.day === day && isClick(x.kind)).map((x) => x.n)),
  }));
  const origins = [...cur.filter((x) => isClick(x.kind)).reduce((m, x) => m.set(x.source, (m.get(x.source) ?? 0) + x.n), new Map<string, number>())]
    .map(([source, clicks]) => ({ source, clicks })).sort((a, b) => b.clicks - a.clicks);
  const queries = (g.search?.queries ?? []).map((x) => ({ query: x.keys[0], impressions: x.impressions, clicks: x.clicks, position: x.position }))
    .sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  const pageRows = new Map<string, SearchRow[]>();
  for (const x of g.search?.pages ?? []) { const s = storeSlugOf(x.keys[0]); if (s) pageRows.set(s, [...(pageRows.get(s) ?? []), x]); }
  const clicksBy = cur.filter((x) => isClick(x.kind)).reduce((m, x) => m.set(x.store_id, (m.get(x.store_id) ?? 0) + x.n), new Map<number, number>());
  const storeStats: StoreStat[] = stores.map((s) => {
    const rows = pageRows.get(s.slug) ?? [];
    return {
      slug: s.slug, name: s.name,
      // a hand-written guide (store-guides.ts) is always published
      guide: (guideSlugs().includes(s.slug) ? "published" : s.guide ?? "none") as StoreStat["guide"],
      impressions: sum(rows.map((x) => x.impressions)), position: meanPosition(rows), visits: g.ga4?.pages.get(s.slug) ?? 0, clicks: clicksBy.get(s.id) ?? 0,
      earned: money.byStore.get(s.id) ?? 0,
    };
  }).filter((s) => s.impressions || s.visits || s.clicks || s.earned || s.guide !== "none")
    .sort((a, b) => b.earned - a.earned || b.impressions - a.impressions || b.clicks - a.clicks).slice(0, 15);
  const next = guides.filter((x) => x.status === "scheduled" || x.draft).sort((a, b) => +a.publish_at - +b.publish_at)[0];
  // the reason shown on the pill: no key, a broken key, or what Google answered (permissions, API not enabled…)
  const note = (ok: boolean, err?: string) => (ok ? "conectado" : err === "sin credenciales" || err?.startsWith("clave no válida") ? err : `error: ${(err ?? "desconocido").slice(0, 80)}`);
  return {
    range: r, days: d,
    sources: { search: { ok: !!g.search, note: note(!!g.search, g.errors.search) }, ga4: { ok: !!g.ga4, note: note(!!g.ga4, g.errors.ga4) },
      awin: { ok: (awin?.n ?? 0) > 0, note: (awin?.n ?? 0) > 0 ? "conectado" : "sin cuenta de Awin" } },
    approved: money.approved,
    cur: totals(cur, g.search?.cur, g.ga4 ? sum([...g.ga4.daily.values()]) : null, money),
    prev: totals(prev, g.search?.prev, g.ga4 ? g.ga4.prev : null, prevMoney),
    daily, origins, queries, stores: storeStats,
    guides: { published: guides.filter((x) => x.status === "published").length, scheduled: guides.filter((x) => x.status === "scheduled" || x.draft).length, next: next ? { name: next.name, at: next.publish_at } : null },
    aiCost: cost?.cost ?? 0,
  };
}
