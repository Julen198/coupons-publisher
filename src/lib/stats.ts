// Everything the Estadísticas page shows: Search Console and GA4 (google-api.ts), Bing Webmaster (bing-api.ts), our own
// clicks and copies (clicks table), AI bots and MCP calls (ai-stats.ts) and the automatic guides / AI costs. Each outside
// source fails on its own: the page still shows the rest and says what is missing.
import { sql } from "./db";
import { commissionsBetween, type CommissionTotals } from "./commissions";
import { guideSlugs } from "./store-guides.ts";
import { assistantOfSource } from "./ai-traffic.ts";
import { ASSISTANT_SOURCES as AI_SOURCES } from "./click-signals.ts";
import { botStats, mcpStats, type BotStats, type McpStats } from "./ai-stats";
import { bingConfigured, bingKeyProblem, bingQueries, bingTraffic, queriesBetween } from "./bing-api.ts";
import { dateRange, ga4Report, googleConfigured, googleKeyProblem, meanPosition, searchAnalytics, storeSlugOf, type SearchRow } from "./google-api.ts";

// 1 = yesterday (dateRange ends yesterday), compared with the day before
export const STATS_RANGES = [1, 7, 28, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export const rangeOf = (v: unknown): StatsRange => (STATS_RANGES.includes(Number(v) as StatsRange) ? (Number(v) as StatsRange) : 28);
export const rangeLabel = (d: StatsRange): string => (d === 1 ? "Ayer" : `${d} días`);

export interface Totals {
  impressions: number; gClicks: number; position: number | null; visits: number | null; clicks: number; copies: number; earned: number; sales: number;
  bImpressions: number | null; bClicks: number | null; aiVisits: number | null; liveReads: number | null; mcpCalls: number | null;
}
export interface DayPoint { day: string; visits: number; clicks: number; aiVisits: number; liveReads: number }
// Google's numbers and, when Bing has the same search, Bing's (null: not in Bing's list for the period)
export interface QueryRow { query: string; impressions: number; clicks: number; position: number; bImpressions: number | null; bClicks: number | null; bPosition: number | null }
export interface StoreStat { slug: string; name: string; guide: "published" | "scheduled" | "rejected" | "none"; impressions: number; position: number | null; visits: number; clicks: number; earned: number }
export interface SourceState { ok: boolean; note: string }

export interface Stats {
  range: ReturnType<typeof dateRange>; days: StatsRange;
  sources: { search: SourceState; ga4: SourceState; bing: SourceState; bots: SourceState; mcp: SourceState; awin: SourceState };
  approved: number; // commissions of the period already approved by the network
  cur: Totals; prev: Totals;
  daily: DayPoint[]; origins: { source: string; clicks: number }[]; queries: QueryRow[]; stores: StoreStat[];
  guides: { published: number; scheduled: number; next: { name: string; at: Date } | null }; aiCost: number;
  bing: { position: number | null; prevPosition: number | null; better: number }; // better: searches where Bing ranks us higher than Google
  assistants: { name: string; visits: number; prev: number }[]; bots: BotStats["bots"]; botsToday: BotStats["today"]; mcp: Omit<McpStats, "ready"> & { clicks: number };
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

type Ai = { daily: Map<string, number>; by: Map<string, number>; prevBy: Map<string, number> };
type Google = { search?: { cur: SearchRow[]; prev: SearchRow[]; queries: SearchRow[]; pages: SearchRow[] }; ga4?: { daily: Map<string, number>; prev: number; pages: Map<string, number>; ai: Ai }; errors: { search?: string; ga4?: string } };

async function google(r: ReturnType<typeof dateRange>): Promise<Google> {
  const out: Google = { errors: {} };
  if (!googleConfigured()) return { errors: { search: googleKeyProblem(), ga4: googleKeyProblem() } };
  const [search, ga4] = await Promise.allSettled([
    Promise.all([
      searchAnalytics(r.start, r.end, ["date"]),
      searchAnalytics(r.prevStart, r.prevEnd, ["date"]),
      searchAnalytics(r.start, r.end, ["query"], 1000),
      searchAnalytics(r.start, r.end, ["page"], 1000),
    ]),
    Promise.all([
      ga4Report(r.start, r.end, ["date"], ["sessions"]),
      ga4Report(r.prevStart, r.prevEnd, [], ["sessions"]),
      ga4Report(r.start, r.end, ["pagePath"], ["screenPageViews"], { dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/tiendas/" } } } }),
      // where the sessions came from, to pick out the ones an assistant sent (assistantOfSource)
      ga4Report(r.start, r.end, ["date", "sessionSource"], ["sessions"], { limit: 10000 }),
      ga4Report(r.prevStart, r.prevEnd, ["sessionSource"], ["sessions"], { limit: 10000 }),
    ]),
  ]);
  if (search.status === "fulfilled") {
    const [cur, prev, queries, pages] = search.value;
    out.search = { cur, prev, queries, pages };
  } else out.errors.search = search.reason instanceof Error ? search.reason.message : "error";
  if (ga4.status === "fulfilled") {
    const [daily, prev, pages, bySource, prevBySource] = ga4.value;
    const ai: Ai = { daily: new Map(), by: new Map(), prevBy: new Map() };
    for (const x of bySource) {
      const name = assistantOfSource(x.dims[1]);
      if (!name) continue;
      const day = `${x.dims[0].slice(0, 4)}-${x.dims[0].slice(4, 6)}-${x.dims[0].slice(6, 8)}`;
      ai.daily.set(day, (ai.daily.get(day) ?? 0) + x.values[0]);
      ai.by.set(name, (ai.by.get(name) ?? 0) + x.values[0]);
    }
    for (const x of prevBySource) {
      const name = assistantOfSource(x.dims[0]);
      if (name) ai.prevBy.set(name, (ai.prevBy.get(name) ?? 0) + x.values[0]);
    }
    const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.ga4 = {
      daily: new Map(daily.map((x) => [iso(x.dims[0]), x.values[0]])),
      prev: prev[0]?.values[0] ?? 0,
      pages: pages.reduce((m, x) => { const s = storeSlugOf(x.dims[0]); return s ? m.set(s, (m.get(s) ?? 0) + x.values[0]) : m; }, new Map<string, number>()),
      ai,
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

// Bing Webmaster: daily clicks and impressions of the site, and weekly stats per query (about six months of each). One
// call of each per hour and instance, whatever the period: the periods are cut from it.
type Bing = { traffic?: Awaited<ReturnType<typeof bingTraffic>>; queries?: Awaited<ReturnType<typeof bingQueries>>; error?: string };
let bingCache: { at: number; value: Bing } | null = null;

async function bingCached(): Promise<Bing> {
  if (bingCache && Date.now() - bingCache.at < CACHE_MS) return bingCache.value;
  if (!bingConfigured()) return { error: bingKeyProblem() };
  try {
    const [traffic, queries] = await Promise.all([bingTraffic(), bingQueries()]);
    const value = { traffic, queries };
    bingCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("stats bing failed", e);
    return { error: e instanceof Error ? e.message : "error" };
  }
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const isClick = (kind: string) => kind === "go" || kind === "untracked";

export async function loadStats(d: StatsRange): Promise<Stats> {
  const r = dateRange(d);
  const [g, b, bots, mcp, cur, prev, stores, guides, [cost], money, prevMoney, [awin]] = await Promise.all([
    googleCached(r),
    bingCached(),
    botStats(r.start, r.end, r.prevStart, r.prevEnd).catch((e) => { console.error("stats bots failed", e); return null; }),
    mcpStats(r.start, r.end, r.prevStart, r.prevEnd).catch((e) => { console.error("stats mcp failed", e); return null; }),
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
  const inRange = (day: string, start: string, end: string) => day >= start && day <= end;
  const bingSum = (start: string, end: string, k: "clicks" | "impressions") => (b.traffic ? sum(b.traffic.filter((x) => inRange(x.day, start, end)).map((x) => x[k])) : null);
  const bingQ = b.queries ? queriesBetween(b.queries, r.start, r.end) : [];
  const bingPrevQ = b.queries ? queriesBetween(b.queries, r.prevStart, r.prevEnd) : [];
  const aiPrev = g.ga4 ? sum([...g.ga4.ai.prevBy.values()]) : null;
  const totals = (rows: typeof cur, search: SearchRow[] | undefined, visits: number | null, m: CommissionTotals, start: string, end: string, isCur: boolean): Totals => ({
    impressions: sum((search ?? []).map((x) => x.impressions)),
    gClicks: sum((search ?? []).map((x) => x.clicks)),
    position: search ? meanPosition(search) : null,
    visits,
    clicks: sum(rows.filter((x) => isClick(x.kind)).map((x) => x.n)),
    copies: sum(rows.filter((x) => x.kind === "copy").map((x) => x.n)),
    earned: m.earned,
    sales: m.sales,
    bImpressions: bingSum(start, end, "impressions"),
    bClicks: bingSum(start, end, "clicks"),
    aiVisits: g.ga4 ? (isCur ? sum([...g.ga4.ai.by.values()]) : aiPrev) : null,
    liveReads: bots?.ready ? (isCur ? bots.live : bots.prevLive) : null,
    mcpCalls: mcp?.ready ? (isCur ? mcp.calls : mcp.prevCalls) : null,
  });
  const daily = days(r.start, r.end).map((day) => ({
    day,
    visits: g.ga4?.daily.get(day) ?? 0,
    clicks: sum(cur.filter((x) => x.day === day && isClick(x.kind)).map((x) => x.n)),
    aiVisits: g.ga4?.ai.daily.get(day) ?? 0,
    liveReads: bots?.liveDaily.get(day) ?? 0,
  }));
  const origins = [...cur.filter((x) => isClick(x.kind)).reduce((m, x) => m.set(x.source, (m.get(x.source) ?? 0) + x.n), new Map<string, number>())]
    .map(([source, clicks]) => ({ source, clicks })).sort((a, b) => b.clicks - a.clicks);
  // Google's and Bing's searches side by side (by the same lowercase text); a search only Bing has gets Google's zeros
  const bingBy = new Map(bingQ.map((x) => [x.keys[0], x]));
  const queries: QueryRow[] = (g.search?.queries ?? []).map((x) => {
    const bq = bingBy.get(x.keys[0].toLowerCase());
    bingBy.delete(x.keys[0].toLowerCase());
    return { query: x.keys[0], impressions: x.impressions, clicks: x.clicks, position: x.position, bImpressions: bq?.impressions ?? null, bClicks: bq?.clicks ?? null, bPosition: bq?.position || null };
  });
  for (const [query, x] of bingBy) queries.push({ query, impressions: 0, clicks: 0, position: 0, bImpressions: x.impressions, bClicks: x.clicks, bPosition: x.position || null });
  queries.sort((a, b) => b.impressions - a.impressions || (b.bImpressions ?? 0) - (a.bImpressions ?? 0)); // all of them: the panel table sorts, filters and pages them
  const bingBetter = queries.filter((q) => q.bPosition && q.position && q.bPosition < q.position).length;
  const posOf = (rows: SearchRow[]) => meanPosition(rows.filter((x) => x.position > 0));
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
      bing: { ok: !b.error, note: !b.error ? "conectado" : b.error === "sin clave" || b.error === "clave no válida" ? b.error : `error: ${b.error.slice(0, 80)}` },
      bots: { ok: !!bots?.ready, note: bots?.ready ? "en directo" : bots ? "falta crear la tabla" : "error" },
      mcp: { ok: !!mcp?.ready, note: mcp?.ready ? "en directo" : mcp ? "falta crear la tabla" : "error" },
      awin: { ok: (awin?.n ?? 0) > 0, note: (awin?.n ?? 0) > 0 ? "conectado" : "sin cuenta de Awin" } },
    approved: money.approved,
    cur: totals(cur, g.search?.cur, g.ga4 ? sum([...g.ga4.daily.values()]) : null, money, r.start, r.end, true),
    prev: totals(prev, g.search?.prev, g.ga4 ? g.ga4.prev : null, prevMoney, r.prevStart, r.prevEnd, false),
    daily, origins, queries, stores: storeStats,
    guides: { published: guides.filter((x) => x.status === "published").length, scheduled: guides.filter((x) => x.status === "scheduled" || x.draft).length, next: next ? { name: next.name, at: next.publish_at } : null },
    aiCost: cost?.cost ?? 0,
    bing: { position: posOf(bingQ), prevPosition: posOf(bingPrevQ), better: bingBetter },
    assistants: g.ga4 ? [...g.ga4.ai.by].map(([name, visits]) => ({ name, visits, prev: g.ga4!.ai.prevBy.get(name) ?? 0 })).sort((a, b) => b.visits - a.visits) : [],
    bots: bots?.bots ?? [],
    botsToday: bots?.today ?? [],
    mcp: { calls: mcp?.calls ?? 0, prevCalls: mcp?.prevCalls ?? 0, today: mcp?.today ?? 0, top: mcp?.top ?? [], clicks: sum(origins.filter((o) => AI_SOURCES.includes(o.source)).map((o) => o.clicks)) },
  };
}
