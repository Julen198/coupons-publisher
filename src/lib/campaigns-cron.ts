// The automatic campaign pages, end to end. Twice a day (vercel.json): publish the texts whose wait is over, read
// Search Console, pick the store × date pages worth a text of their own (searches between 8 and 30 first, then the
// calendar, weeks ahead), write and check them, look for new events in the coupons and the searches, take the «before»
// snapshot of each date and send the «after» review. Everything goes to the admin chat on Telegram; people only step in
// to cancel (/panel/campanas). Rules: campaign-rules.ts.
import { sql } from "./db";
import { CAMPAIGN_SQL } from "./campaign-schema.ts";
import { generateCampaignText } from "./ai-campaign";
import {
  CAMPAIGN_DEFAULTS, CAMPAIGN_MAX_SIMILARITY, CAMPAIGN_MAX_WORDS, CAMPAIGN_MIN_WORDS, NEAR_MAX, addDays, baselineDue, campaignKeyword,
  campaignSettingsOf, daysFrom, delayFor, detectEvents, editionOf, eventInQuery, eventsToPlan, formatBaseline, formatReview, isNear,
  fitsToday, guidesToImprove, isUrgent, planCampaigns, queryOpportunities, type GuideState, type GuideWork, reviewDue, reviewWindows, takenKey, totalsOf, wrongYears,
  type CampaignSettings, type CampaignStore, type CampaignTarget, type DetectedEvent, type EventMetrics, type Opportunity, type QueryRow,
  type ReviewInput, type StoreResult,
} from "./campaign-rules.ts";
import { EVENT_PAGES, eventCouponsByStore, eventDeals, eventPageOf, storeEventPath, type EventPage } from "./event-pages.ts";
import { guideProblems, guideSimilarity, MAX_SIMILARITY } from "./guide-rules.ts";
import { categoryOf } from "./catalog";
import { siteCoupons, siteStore, type SiteCoupon } from "./public-site";
import { eventsOf, longDate, madridToday, siteUrl } from "./site-text";
import { dateRange, googleConfigured, searchAnalytics, storeSlugOf, type SearchRow } from "./google-api.ts";
import { pingIndexNow } from "./guide-index";
import { publishedGuide } from "./store-guides-db";
import { guideSlugs, storeGuide, type StoreGuide } from "./store-guides.ts";
import { guideSettings, scheduleGuide, writeGuide } from "./guides-cron";
import { tg, telegramConfig } from "./telegram";
import { appUrl } from "./email";
import { isPerk } from "./perks.ts";

// The cron creates its own tables (the same statements are in SCHEMA_SQL for npm run db:setup), so it works the day it
// is deployed without anyone running SQL by hand
let ensured = false;
export async function ensureCampaignTables(): Promise<void> {
  if (ensured) return;
  await sql().unsafe(CAMPAIGN_SQL);
  ensured = true;
}

export type CampaignStatus = "scheduled" | "published" | "rejected";
export interface CampaignSignals { reason?: string; queries?: string[]; impressions?: number; position?: number | null; score?: number; problems?: string[] }
export interface CampaignRow {
  store_id: number; slug: string; name: string; event: string; year: number; status: CampaignStatus; content: StoreGuide;
  signals: CampaignSignals; publish_at: Date; published_at: Date | null; created_at: Date;
}
export interface CampaignReport { event: string; year: number; kind: "baseline" | "review"; data: unknown; text: string; created_at: Date }

export async function campaignSettings(): Promise<CampaignSettings> {
  const rows = await sql()<{ key: string; value: string }[]>`SELECT key, value FROM settings WHERE key LIKE 'campaigns\_%'`;
  return rows.length ? campaignSettingsOf(Object.fromEntries(rows.map((r) => [r.key, r.value]))) : CAMPAIGN_DEFAULTS;
}

export async function campaignRows(): Promise<CampaignRow[]> {
  await ensureCampaignTables();
  const rows = await sql()<CampaignRow[]>`
    SELECT g.store_id, s.slug, s.name, g.event, g.year, g.status, g.content, g.signals, g.publish_at, g.published_at, g.created_at
    FROM campaign_guides g JOIN stores s ON s.id = g.store_id ORDER BY g.publish_at DESC`;
  return rows.map((r) => ({ ...r }));
}

export async function campaignReports(): Promise<CampaignReport[]> {
  await ensureCampaignTables();
  const rows = await sql()<CampaignReport[]>`SELECT event, year, kind, data, text, created_at FROM campaign_reports ORDER BY created_at DESC LIMIT 30`;
  return rows.map((r) => ({ ...r }));
}

// ---- Search Console

async function searchRows(start: string, end: string, dims: string[]): Promise<SearchRow[]> {
  if (!googleConfigured()) return [];
  try {
    return await searchAnalytics(start, end, dims, 5000);
  } catch (e) {
    console.error("campaigns: Search Console read failed", e);
    return [];
  }
}

const queryRowsOf = (rows: readonly SearchRow[]): QueryRow[] =>
  rows.map((r) => ({ query: r.keys[0] ?? "", page: r.keys[1] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position }));

const pathOf = (page: string) => {
  try {
    return new URL(page).pathname;
  } catch {
    return page;
  }
};

// ---- the stores, as the planner sees them

export async function campaignStores(coupons: SiteCoupon[], rows: readonly QueryRow[], today: string): Promise<CampaignStore[]> {
  const [stores, clicks] = await Promise.all([
    sql()<{ id: number; slug: string; name: string; country: string; category: string }[]>`SELECT id, slug, name, country, category FROM stores`,
    sql()<{ store_id: number; n: number }[]>`SELECT store_id, count(*)::int AS n FROM clicks WHERE at > now() - interval '30 days' GROUP BY store_id`,
  ]);
  const clicksOf = new Map(clicks.map((c) => [c.store_id, c.n]));
  const live = new Map<number, number>();
  for (const c of coupons) live.set(c.store_id, (live.get(c.store_id) ?? 0) + 1);
  const impressions = new Map<string, number>();
  for (const r of rows) {
    const slug = storeSlugOf(r.page) ?? /\/ofertas\/[^/]+\/([a-z0-9-]+)/.exec(pathOf(r.page))?.[1];
    if (slug) impressions.set(slug, (impressions.get(slug) ?? 0) + r.impressions);
  }
  const forEvent = new Map<string, Record<string, number>>();
  for (const e of EVENT_PAGES)
    for (const s of eventCouponsByStore(e, coupons, today)) forEvent.set(s.slug, { ...(forEvent.get(s.slug) ?? {}), [e.slug]: s.n });
  // only stores on the public site (coupons come from siteCoupons, which already leaves the rest out)
  const onSite = new Set(coupons.map((c) => c.store_id));
  return stores
    .filter((s) => onSite.has(s.id))
    .map((s) => ({
      storeId: s.id, slug: s.slug, name: s.name, country: s.country ?? "", category: s.category ?? "", live: live.get(s.id) ?? 0,
      clicks30: clicksOf.get(s.id) ?? 0, impressions: impressions.get(s.slug) ?? 0, eventCoupons: forEvent.get(s.slug) ?? {},
    }));
}

async function takenKeys(): Promise<Set<string>> {
  const rows = await sql()<{ store_id: number; event: string; year: number }[]>`SELECT store_id, event, year FROM campaign_guides`;
  return new Set(rows.map((r) => takenKey(r.store_id, r.event, r.year)));
}

// The stores that brought clicks or sales on the last review of each date: they go first next time
async function provenStores(): Promise<Map<string, Set<string>>> {
  const rows = await sql()<{ event: string; data: { stores?: StoreResult[] } }[]>`SELECT event, data FROM campaign_reports WHERE kind = 'review' ORDER BY year`;
  const out = new Map<string, Set<string>>();
  for (const r of rows) out.set(r.event, new Set((r.data.stores ?? []).filter((s) => s.sales > 0 || s.clicks >= 5).map((s) => s.slug)));
  return out;
}

const TOP_CLICKED = 5;

export interface CampaignPlan { opportunities: Opportunity[]; targets: CampaignTarget[]; guides: GuideWork[]; detected: DetectedEvent[]; rows: QueryRow[]; coupons: SiteCoupon[] }

// Where each store's guide stands, for guidesToImprove
async function guideStates(stores: readonly CampaignStore[]): Promise<Map<string, GuideState>> {
  const rows = await sql()<{ slug: string; status: GuideState["status"]; at: Date | null; draft: boolean }[]>`
    SELECT s.slug, g.status, coalesce(g.rewritten_at, g.published_at, g.created_at) AS at, g.draft IS NOT NULL AS draft
    FROM store_guides g JOIN stores s ON s.id = g.store_id`;
  const by = new Map(rows.map((r) => [r.slug, r]));
  const hand = new Set(guideSlugs());
  return new Map(stores.map((s) => {
    const g = by.get(s.slug);
    const status: GuideState["status"] = hand.has(s.slug) ? "hand" : g ? g.status : "none";
    return [s.slug, { status, lastWritten: g?.at ? g.at.toISOString().slice(0, 10) : null, live: s.live, pendingRewrite: !!g?.draft }];
  }));
}

// What the next run would write, for the cron and the panel
export async function campaignPlan(settings?: CampaignSettings): Promise<CampaignPlan> {
  await ensureCampaignTables();
  const today = madridToday().iso;
  const r = dateRange(28);
  const [coupons, sc, taken, proven, s] = await Promise.all([siteCoupons(), searchRows(r.start, r.end, ["query", "page"]), takenKeys(), provenStores(), settings ?? campaignSettings()]);
  const rows = queryRowsOf(sc);
  const stores = await campaignStores(coupons, rows, today);
  const opportunities = queryOpportunities(rows, stores);
  // the stores readers click most right now (Samsung, the week this was written) count as proven on every date
  const topClicked = [...stores].filter((x) => x.clicks30 >= 3).sort((a, b) => b.clicks30 - a.clicks30).slice(0, TOP_CLICKED).map((x) => x.slug);
  for (const e of EVENT_PAGES) proven.set(e.slug, new Set([...(proven.get(e.slug) ?? []), ...topClicked]));
  const targets = planCampaigns({ today, settings: s, opportunities, stores, taken, proven });
  const guides = guidesToImprove(opportunities, await guideStates(stores), today);
  const detected = detectEvents([
    ...coupons.map((c) => ({ text: `${c.display_title || c.title} ${c.description}`, store: c.store_name })),
    ...rows.map((q) => ({ text: q.query, store: "", search: true })),
  ]);
  return { opportunities, targets, guides, detected, rows, coupons };
}

// ---- writing one page

export type WriteResult = { guide: StoreGuide | null; problems: string[] };

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const when = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${longDate(iso)}`;

async function sameEventTexts(event: string, storeId: number): Promise<StoreGuide[]> {
  const rows = await sql()<{ content: StoreGuide }[]>`SELECT content FROM campaign_guides WHERE event = ${event} AND store_id <> ${storeId} AND status <> 'rejected'`;
  return rows.map((r) => r.content);
}

export async function writeCampaign(t: Pick<CampaignTarget, "storeId" | "slug" | "event" | "queries">, coupons?: SiteCoupon[]): Promise<WriteResult & { year: number }> {
  const e = eventPageOf(t.event);
  const today = madridToday().iso;
  if (!e) return { guide: null, problems: ["evento desconocido"], year: 0 };
  const ed = editionOf(e, today);
  const store = await siteStore(t.slug);
  if (!store) return { guide: null, problems: ["la tienda no está en la web"], year: ed.year };
  const mine = (coupons ?? (await siteCoupons())).filter((c) => c.store_id === store.id && !isPerk(c));
  const { matched } = eventDeals(e, mine, today);
  const forEvent = new Set(matched.map((c) => c.id));
  const keyword = campaignKeyword(e.name, store.name);
  const [others, ownGuide] = await Promise.all([sameEventTexts(e.slug, store.id), publishedGuide(store.id)]);
  const storeText = storeGuide(store.slug) ?? ownGuide;
  const input = {
    slug: store.slug, storeName: store.name, website: store.website, category: categoryOf(store.category)?.label ?? "", facts: store.facts, intro: store.intro,
    eventName: e.name, year: ed.year, date: when(ed.date), eventWhat: e.what, keyword, searches: t.queries,
    coupons: [...mine].sort((a, b) => Number(forEvent.has(b.id)) - Number(forEvent.has(a.id))).map((c) => ({
      kind: c.kind, title: c.display_title || c.title, discount: c.discount, description: c.description, expires_at: c.expires_at, forEvent: forEvent.has(c.id),
    })),
  };
  const codes = mine.map((c) => c.code).filter(Boolean);
  let last: WriteResult = { guide: null, problems: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    let guide: StoreGuide;
    try {
      guide = await generateCampaignText({ ...input, fix: last.problems });
    } catch (e) {
      // a malformed answer gets the second try; the budget limit and the second failure stop here
      if ((e instanceof Error && e.name === "AiBudgetError") || attempt === 1) throw e;
      last = { guide: null, problems: ["la respuesta no seguía el formato pedido: 2 a 4 secciones con 1 a 3 párrafos y 3 a 5 preguntas"] };
      continue;
    }
    const problems = guideProblems(guide, { facts: store.facts, codes }, { min: CAMPAIGN_MIN_WORDS, max: CAMPAIGN_MAX_WORDS });
    if (guide.sections.length < 2) problems.push("necesita al menos 2 secciones");
    if (guide.faqs.length < 3) problems.push("necesita al menos 3 preguntas frecuentes");
    const years = wrongYears(guide, ed.year);
    if (years.length) problems.push(`menciona otro año (${years.join(", ")})`);
    const twin = others.find((o) => guideSimilarity(guide, o) > CAMPAIGN_MAX_SIMILARITY);
    if (twin) problems.push(`se parece demasiado al texto de ${e.name} de ${twin.slug}`);
    if (storeText && guideSimilarity(guide, storeText) > MAX_SIMILARITY) problems.push("repite la guía de la tienda");
    last = { guide, problems };
    if (!problems.length) break;
  }
  return { ...last, year: ed.year };
}

// A new text, or this year's in place of last year's (the URL is the same every year)
export async function scheduleCampaign(storeId: number, event: string, year: number, guide: StoreGuide, signals: CampaignSignals, delayHours: number, status: "scheduled" | "rejected" = "scheduled"): Promise<Date> {
  const [row] = await sql()<{ publish_at: Date }[]>`
    INSERT INTO campaign_guides (store_id, event, year, status, content, signals, publish_at)
    VALUES (${storeId}, ${event}, ${year}, ${status}, ${sql().json(guide as never)}, ${sql().json(signals as never)}, now() + make_interval(hours => ${delayHours}))
    ON CONFLICT (store_id, event) DO UPDATE SET
      year = EXCLUDED.year, status = EXCLUDED.status, content = EXCLUDED.content, signals = EXCLUDED.signals,
      publish_at = EXCLUDED.publish_at, published_at = NULL, created_at = now()
    RETURNING publish_at`;
  return row.publish_at;
}

// ---- the run

// Out right away (delay 0): published, and IndexNow told about the page and its event page
export async function publishCampaignNow(storeId: number, event: string, slug: string): Promise<void> {
  await sql()`UPDATE campaign_guides SET status = 'published', published_at = now(), publish_at = now() WHERE store_id = ${storeId} AND event = ${event} AND status = 'scheduled'`;
  await pingIndexNow([storeEventPath(event, slug), `/ofertas/${event}`]);
}

async function publishDue(): Promise<{ name: string; slug: string; event: string }[]> {
  const rows = await sql()<{ name: string; slug: string; event: string }[]>`
    UPDATE campaign_guides g SET status = 'published', published_at = now() FROM stores s
    WHERE s.id = g.store_id AND g.status = 'scheduled' AND g.publish_at <= now() RETURNING s.name, s.slug, g.event`;
  if (rows.length) await pingIndexNow([...new Set([...rows.map((r) => storeEventPath(r.event, r.slug)), ...rows.map((r) => `/ofertas/${r.event}`)])]);
  return rows.map((r) => ({ ...r }));
}

async function writtenToday(): Promise<number> {
  const [row] = await sql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM campaign_guides WHERE (created_at AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date`;
  return row?.n ?? 0;
}

const fmtWhen = (d: Date) => d.toLocaleString("es-ES", { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const eventName = (slug: string) => eventPageOf(slug)?.name ?? slug;

async function notify(text: string, panel = "/panel/campanas") {
  const cfg = telegramConfig();
  if (!cfg || !text.trim()) return;
  try {
    await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: `${text}\n\nRevisar o cancelar: ${appUrl()}${panel}`.slice(0, 4000), disable_web_page_preview: true });
  } catch (e) {
    console.error("campaigns telegram notice failed", e);
  }
}

// Stop starting new pages after this, inside the route's maxDuration of 300 s
const TIME_BUDGET_MS = 200_000;

export interface CampaignCronResult {
  published: string[]; scheduled: { name: string; event: string; publishAt: Date }[]; failed: { name: string; event: string; problems: string[] }[];
  guides: string[]; detected: string[]; baselines: string[]; reviews: string[]; skipped?: string;
}

// The store guides the searches ask for (guidesToImprove): written with those searches in the prompt and published at once
async function improveGuides(plan: CampaignPlan, started: number): Promise<string[]> {
  if (!plan.guides.length) return [];
  const settings = await guideSettings(); // only its on/off switch: these go out at once
  if (!settings.enabled) return [];
  const done: string[] = [];
  const lines: string[] = [];
  for (const w of plan.guides) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const out = await writeGuide(w.slug, plan.coupons, w.queries);
      if (!out.guide || out.problems.length) {
        lines.push(`⚠️ Guía de ${w.name}: ${out.problems.join("; ")}`);
        continue;
      }
      // the searches are there now: out right away, like the campaign pages («Quitar de la web» in Guías SEO)
      await scheduleGuide(w.storeId, out.guide, { storeId: w.storeId, slug: w.slug, name: w.name, impressions: w.impressions, position: w.position }, 0);
      await sql()`
        UPDATE store_guides SET status = 'published', published_at = now(), publish_at = now(), content = COALESCE(draft, content), draft = NULL,
          rewritten_at = CASE WHEN draft IS NOT NULL THEN now() ELSE rewritten_at END
        WHERE store_id = ${w.storeId} AND (status = 'scheduled' OR draft IS NOT NULL)`;
      await pingIndexNow([`/tiendas/${w.slug}`]);
      lines.push(`🚀 ${w.rewrite ? "Reescrita" : "Escrita"} y publicada la guía de ${w.name} para «${w.queries.slice(0, 3).join("», «")}» (posición ${w.position}): ${siteUrl()}/tiendas/${w.slug}`);
      done.push(w.name);
    } catch (e) {
      console.error("campaigns: store guide failed", w.slug, e);
      if (e instanceof Error && e.name === "AiBudgetError") break;
    }
  }
  if (lines.length) await notify(lines.join("\n"), "/panel/guias");
  return done;
}

export async function runCampaignsCron(started = Date.now()): Promise<CampaignCronResult> {
  await ensureCampaignTables();
  const settings = await campaignSettings();
  const published = await publishDue();
  if (published.length) await notify(`✅ Publicadas ${published.length} páginas de campaña: ${published.map((p) => `${eventName(p.event)} ${p.name}`).join(", ")}.`);
  const result: CampaignCronResult = { published: published.map((p) => `${eventName(p.event)} ${p.name}`), scheduled: [], failed: [], guides: [], detected: [], baselines: [], reviews: [] };
  const livePaths: string[] = [];
  if (!settings.enabled) return { ...result, skipped: "desactivado en el panel" };

  const plan = await campaignPlan(settings);
  const today = madridToday().iso;
  // the «before» snapshot of the dates entering the plan, then the texts, then the reviews of the dates that ended
  result.baselines = await takeBaselines(settings, plan, today);
  let written = await writtenToday();
  for (const t of plan.targets) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    if (!fitsToday(isUrgent(t, today), written, settings.perDay)) continue;
    written++;
    try {
      const out = await writeCampaign(t, plan.coupons);
      const signals: CampaignSignals = { reason: t.reason, queries: t.queries, impressions: t.impressions, position: t.position, score: t.score };
      if (out.guide && !out.problems.length) {
        const delay = delayFor(daysFrom(today, t.date), settings);
        const publishAt = await scheduleCampaign(t.storeId, t.event, out.year, out.guide, signals, delay);
        if (delay === 0) {
          await publishCampaignNow(t.storeId, t.event, t.slug);
          result.published.push(`${eventName(t.event)} ${t.name}`);
          livePaths.push(storeEventPath(t.event, t.slug));
        } else result.scheduled.push({ name: t.name, event: t.event, publishAt });
        continue;
      }
      // kept as cancelled so it isn't retried (and billed) every run; «Reescribir» in the panel tries again
      if (out.guide) await scheduleCampaign(t.storeId, t.event, out.year, out.guide, { ...signals, problems: out.problems }, 0, "rejected");
      result.failed.push({ name: t.name, event: t.event, problems: out.problems });
    } catch (e) {
      console.error("campaign write failed", t.slug, t.event, e);
      result.failed.push({ name: t.name, event: t.event, problems: [e instanceof Error ? e.message : "error al escribir"] });
      if (e instanceof Error && e.name === "AiBudgetError") break;
    }
  }
  if (livePaths.length)
    await notify([`🚀 ${livePaths.length} páginas de campaña publicadas ya (IndexNow avisado):`, ...livePaths.map((p) => `• ${siteUrl()}${p}`), "", "Si alguna no te gusta: «Quitar de la web» en el panel."].join("\n"));
  if (result.scheduled.length)
    await notify([`📝 ${result.scheduled.length} páginas de campaña escritas:`, ...result.scheduled.map((s) => `• ${eventName(s.event)} ${s.name}: se publica el ${fmtWhen(s.publishAt)}`)].join("\n"));
  if (result.failed.length)
    await notify([`⚠️ No se pudieron escribir ${result.failed.length}:`, ...result.failed.map((f) => `• ${eventName(f.event)} ${f.name}: ${f.problems.join("; ")}`)].join("\n"));
  result.guides = await improveGuides(plan, started);
  result.detected = await announceDetected(plan.detected);
  if (Date.now() - started < TIME_BUDGET_MS + 60_000) result.reviews = await sendReviews(today);
  return result;
}

// ---- new events

export const DETECTED_KEY = "campaigns_detected";

export async function detectedEvents(): Promise<(DetectedEvent & { firstSeen: string })[]> {
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = ${DETECTED_KEY}`;
  try {
    return row ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}

// Tells the admin chat about the events seen for the first time, and keeps the list for the panel
async function announceDetected(found: DetectedEvent[]): Promise<string[]> {
  const before = await detectedEvents();
  const seen = new Map(before.map((d) => [d.key, d.firstSeen]));
  const today = madridToday().iso;
  const fresh = found.filter((d) => !seen.has(d.key));
  const list = found.map((d) => ({ ...d, firstSeen: seen.get(d.key) ?? today }));
  // what was seen before and isn't now stays for 90 days, so a yearly sale is remembered between editions
  const kept = before.filter((d) => !found.some((f) => f.key === d.key) && d.firstSeen >= addDays(today, -90));
  await sql()`INSERT INTO settings (key, value) VALUES (${DETECTED_KEY}, ${JSON.stringify([...list, ...kept])}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  if (fresh.length)
    await notify([
      "🆕 Eventos nuevos en los cupones o en las búsquedas (no están en el calendario):",
      ...fresh.slice(0, 8).map((d) => `• ${d.name}: ${d.count} ${d.count === 1 ? "mención" : "menciones"}${d.stores.length ? ` (${d.stores.slice(0, 4).join(", ")})` : ""}${d.fromSearch ? `, ${d.fromSearch} en búsquedas de Google` : ""}. Ej.: «${d.samples[0]}»`),
      "",
      "Si es una fecha que se repite, dímelo y le damos su página de calendario.",
    ].join("\n"));
  return fresh.map((d) => d.name);
}

// ---- before and after

const eventPages = (rows: readonly SearchRow[], slug: string) => rows.filter((r) => pathOf(r.keys[0] ?? "").startsWith(`/ofertas/${slug}`));
const eventQueries = (rows: readonly SearchRow[], e: EventPage) => rows.filter((r) => eventInQuery(r.keys[0] ?? "", [e]));

async function clickCounts(slug: string, start: string, end: string): Promise<{ event: number; site: number; byStore: Map<number, number> }> {
  try {
    const rows = await sql()<{ store_id: number; ev: number; n: number }[]>`
      SELECT store_id, count(*) FILTER (WHERE ref LIKE ${`/ofertas/${slug}%`})::int AS ev, count(*)::int AS n FROM clicks
      WHERE at >= ${start}::date AND at < ${addDays(end, 1)}::date AND kind <> 'untracked' GROUP BY store_id`;
    return { event: rows.reduce((n, r) => n + r.ev, 0), site: rows.reduce((n, r) => n + r.n, 0), byStore: new Map(rows.map((r) => [r.store_id, r.ev])) };
  } catch (e) {
    console.error("campaigns: clicks read failed", e);
    return { event: 0, site: 0, byStore: new Map() };
  }
}

async function commissionsIn(start: string, end: string): Promise<{ amount: number; sales: number; byStore: Map<number, { amount: number; sales: number }> }> {
  try {
    const rows = await sql()<{ store_id: number | null; amount: number; n: number }[]>`
      SELECT store_id, coalesce(sum(amount), 0)::float AS amount, count(*)::int AS n FROM commissions
      WHERE at >= ${start}::date AND at < ${addDays(end, 1)}::date AND status NOT IN ('declined', 'rejected') GROUP BY store_id`;
    return {
      amount: rows.reduce((n, r) => n + r.amount, 0), sales: rows.reduce((n, r) => n + r.n, 0),
      byStore: new Map(rows.filter((r) => r.store_id != null).map((r) => [r.store_id as number, { amount: r.amount, sales: r.n }])),
    };
  } catch (e) {
    console.error("campaigns: commissions read failed", e);
    return { amount: 0, sales: 0, byStore: new Map() };
  }
}

async function takeBaselines(settings: CampaignSettings, plan: CampaignPlan, today: string): Promise<string[]> {
  const have = new Set((await sql()<{ event: string; year: number }[]>`SELECT event, year FROM campaign_reports WHERE kind = 'baseline'`).map((r) => `${r.event}:${r.year}`));
  const done: string[] = [];
  const r = dateRange(28);
  for (const ed of eventsToPlan(today, settings.leadDays)) {
    if (have.has(`${ed.event.slug}:${ed.year}`) || !baselineDue(ed, today, settings.leadDays)) continue;
    const ly = reviewWindows(ed).lastYear;
    const [pages, lastYear] = await Promise.all([searchRows(r.start, r.end, ["page"]), searchRows(ly.start, ly.end, ["query"])]);
    const queries = plan.rows.filter((q) => eventInQuery(q.query, [ed.event]));
    const near = queries.filter((q) => isNear(q.position)).sort((a, b) => b.impressions - a.impressions).map((q) => ({ query: q.query, position: Math.round(q.position * 10) / 10, impressions: q.impressions }));
    const data = {
      event: ed.event.slug, name: ed.event.name, year: ed.year, date: ed.date,
      queries: totalsOf(queries), pages: totalsOf(eventPages(pages, ed.event.slug)), lastYear: lastYear.length ? totalsOf(eventQueries(lastYear, ed.event)) : null,
      targets: plan.targets.filter((t) => t.event === ed.event.slug).map((t) => t.name), near,
    };
    const text = formatBaseline(data);
    await sql()`INSERT INTO campaign_reports (event, year, kind, data, text) VALUES (${ed.event.slug}, ${ed.year}, 'baseline', ${sql().json(data as never)}, ${text}) ON CONFLICT DO NOTHING`;
    await notify(text);
    done.push(`${ed.event.name} ${ed.year}`);
  }
  return done;
}

// The edition of a date that ended last (this year's or last year's)
function lastEdition(e: EventPage, today: string): { year: number; date: string; ends: string } | null {
  const y = Number(today.slice(0, 4));
  for (const year of [y, y - 1]) {
    const entry = eventsOf(year).find((x) => x.name === e.calendarName(year));
    if (!entry) continue;
    const ends = addDays(entry.date, e.lastsDays);
    if (ends < today) return { year, date: entry.date, ends };
  }
  return null;
}

export async function buildReview(e: EventPage, ed: { year: number; date: string; ends: string }): Promise<ReviewInput> {
  const w = reviewWindows(ed);
  const [qDuring, qBefore, qLast, pDuring, pBefore, cDuring, cBefore, mDuring, mBefore, guides, stores] = await Promise.all([
    searchRows(w.during.start, w.during.end, ["query"]), searchRows(w.before.start, w.before.end, ["query"]), searchRows(w.lastYear.start, w.lastYear.end, ["query"]),
    searchRows(w.during.start, w.during.end, ["page"]), searchRows(w.before.start, w.before.end, ["page"]),
    clickCounts(e.slug, w.during.start, w.during.end), clickCounts(e.slug, w.before.start, w.before.end),
    commissionsIn(w.during.start, w.during.end), commissionsIn(w.before.start, w.before.end),
    sql()<{ store_id: number; slug: string; name: string; published_at: Date | null; signals: CampaignSignals }[]>`
      SELECT g.store_id, s.slug, s.name, g.published_at, g.signals FROM campaign_guides g JOIN stores s ON s.id = g.store_id
      WHERE g.event = ${e.slug} AND g.year = ${ed.year} AND g.status = 'published'`,
    sql()<{ id: number; slug: string; name: string }[]>`SELECT id, slug, name FROM stores`,
  ]);
  const metrics = (q: SearchRow[], p: SearchRow[], c: { event: number; site: number }, m: { amount: number; sales: number }): EventMetrics => ({
    queries: totalsOf(eventQueries(q, e)), pages: totalsOf(eventPages(p, e.slug)), storeClicks: c.event, siteClicks: c.site, commissions: m.amount, sales: m.sales,
  });
  const before = new Map(eventPages(pBefore, e.slug).map((r) => [pathOf(r.keys[0]), r]));
  const pages = eventPages(pDuring, e.slug).map((r) => {
    const b = before.get(pathOf(r.keys[0]));
    return { path: pathOf(r.keys[0]), after: totalsOf([r]), before: b ? totalsOf([b]) : { impressions: 0, clicks: 0, position: null } };
  });
  const storeIds = new Set([...cDuring.byStore.keys(), ...mDuring.byStore.keys()]);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const storeResults: StoreResult[] = [...storeIds]
    .map((id) => ({ slug: byId.get(id)?.slug ?? String(id), name: byId.get(id)?.name ?? String(id), clicks: cDuring.byStore.get(id) ?? 0, commissions: mDuring.byStore.get(id)?.amount ?? 0, sales: mDuring.byStore.get(id)?.sales ?? 0 }))
    .filter((s) => s.clicks > 0 || s.sales > 0)
    .sort((a, b) => b.commissions - a.commissions || b.clicks - a.clicks);
  const evQ = eventQueries(qDuring, e);
  return {
    event: e.slug, name: e.name, year: ed.year, date: ed.date, ends: ed.ends,
    before: metrics(qBefore, pBefore, cBefore, mBefore), during: metrics(qDuring, pDuring, cDuring, mDuring),
    lastYear: qLast.length ? totalsOf(eventQueries(qLast, e)) : null,
    pages, stores: storeResults,
    campaignPages: guides.map((g) => ({ slug: g.slug, name: g.name, publishedAt: g.published_at ? g.published_at.toISOString() : null, reason: g.signals.reason ?? "" })),
    stillNear: evQ.filter((r) => isNear(r.position) && r.impressions >= 3).sort((a, b) => b.impressions - a.impressions).map((r) => ({ query: r.keys[0], position: Math.round(r.position * 10) / 10, impressions: r.impressions })),
    hard: evQ.filter((r) => r.position > NEAR_MAX && r.impressions >= 50).sort((a, b) => b.impressions - a.impressions).map((r) => ({ query: r.keys[0], position: Math.round(r.position), impressions: r.impressions })),
  };
}

async function sendReviews(today: string): Promise<string[]> {
  const have = new Set((await sql()<{ event: string; year: number }[]>`SELECT event, year FROM campaign_reports WHERE kind = 'review'`).map((r) => `${r.event}:${r.year}`));
  const done: string[] = [];
  for (const e of EVENT_PAGES) {
    const ed = lastEdition(e, today);
    // a review is written once, from a week after the end and for two months (older ones would compare stale data)
    if (!ed || have.has(`${e.slug}:${ed.year}`) || !reviewDue(ed, today) || today > addDays(ed.ends, 60)) continue;
    const review = await buildReview(e, ed);
    const text = formatReview(review);
    await sql()`INSERT INTO campaign_reports (event, year, kind, data, text) VALUES (${e.slug}, ${ed.year}, 'review', ${sql().json(review as never)}, ${text}) ON CONFLICT DO NOTHING`;
    await notify(text);
    done.push(`${e.name} ${ed.year}`);
  }
  return done;
}
