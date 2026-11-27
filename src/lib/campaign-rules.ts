// Rules of the automatic campaign pages (campaigns-cron.ts): which store × shopping-date pages
// (/ofertas/<evento>/<tienda>) get their own text and when, which Google searches point at them, which new events show up
// in the networks' coupons and in the searches, and the before/after review of each event. Pure, so it tests alone.
import { EVENT_PAGES, eventEdition, type EventPage } from "./event-pages.ts";
import type { StoreGuide } from "./store-guides.ts";

// ---- settings (settings table, campaigns_* keys, edited in /panel/campanas)

export interface CampaignSettings { enabled: boolean; perDay: number; delayHours: number; leadDays: number; storesPerEvent: number }
// delayHours 0: published as soon as written (Julen, 27 Nov: «publícalas ya»); the admin chat is told and «Quitar de
// la web» in the panel takes one down
export const CAMPAIGN_DEFAULTS: CampaignSettings = { enabled: true, perDay: 12, delayHours: 0, leadDays: 42, storesPerEvent: 12 };
// ponytail: hard ceiling, the same scaled-content worry as the store guides (guide-rules.ts MAX_PER_DAY)
const MAX_PER_DAY = 12;

const intIn = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? Math.min(n, max) : fallback;
};

export function campaignSettingsOf(v: Record<string, string | undefined>): CampaignSettings {
  return {
    enabled: v.campaigns_enabled ? v.campaigns_enabled === "1" : CAMPAIGN_DEFAULTS.enabled,
    perDay: intIn(v.campaigns_per_day, 1, MAX_PER_DAY, CAMPAIGN_DEFAULTS.perDay),
    delayHours: intIn(v.campaigns_delay_hours, 0, 24 * 7, CAMPAIGN_DEFAULTS.delayHours),
    leadDays: intIn(v.campaigns_lead_days, 7, 120, CAMPAIGN_DEFAULTS.leadDays),
    storesPerEvent: intIn(v.campaigns_stores_per_event, 1, 40, CAMPAIGN_DEFAULTS.storesPerEvent),
  };
}

// An event this close gets its texts out sooner than the usual wait: Google needs the days more than the review does
export const URGENT_DAYS = 7;
export const URGENT_DELAY_HOURS = 0;
// Pages for a date this close, or for searches Google already shows us for, don't wait for tomorrow's quota: up to this
// many a day in all
export const URGENT_PER_DAY = 30;
export const isUrgent = (t: { reason: string; date: string }, today: string) => t.reason === "busqueda" || daysFrom(today, t.date) <= URGENT_DAYS;
// Whether one more page fits today: `written` pages so far, the panel's perDay for the rest
export const fitsToday = (urgent: boolean, written: number, perDay: number) => written < (urgent ? Math.max(perDay, URGENT_PER_DAY) : perDay);
export const delayFor = (daysToEvent: number, settings: CampaignSettings): number =>
  daysToEvent <= URGENT_DAYS ? Math.min(settings.delayHours, URGENT_DELAY_HOURS) : settings.delayHours;

// ---- dates

const DAY_MS = 86_400_000;
export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export const daysFrom = (fromIso: string, toIso: string) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);

export interface Edition { event: EventPage; year: number; date: string; ends: string }
export const editionOf = (e: EventPage, today: string): Edition => ({ event: e, ...eventEdition(e, today) });

// The events whose pages get written now: from leadDays before the date until the date itself, nearest first
export function eventsToPlan(today: string, leadDays: number, events: readonly EventPage[] = EVENT_PAGES): Edition[] {
  return events
    .map((e) => editionOf(e, today))
    .filter((x) => today >= addDays(x.date, -leadDays) && today <= x.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// A page that went out less than this before the date had little time to rank: the review calls it late
export const ON_TIME_DAYS = 21;

// ---- matching a Google search to a store and an event

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();

export interface StoreRef { storeId: number; slug: string; name: string }

// The store a search names: its name or its slug as whole words («cupón esdemarca», «atmosfera sport código»), or
// written together («atmosferasport»). The longest match wins (Pull&Bear over Bear). Forms under 3 characters never
// match («hm» alone, but «h&m» → «h m» does).
export function storeInQuery(query: string, stores: readonly StoreRef[]): StoreRef | null {
  const q = ` ${normalize(query)} `;
  const words = new Set(q.trim().split(" "));
  let best: { s: StoreRef; len: number } | null = null;
  for (const s of stores) {
    for (const form of new Set([normalize(s.name), normalize(s.slug.replace(/-/g, " "))])) {
      if (form.length < 3) continue;
      const together = form.replace(/ /g, "");
      const hit = q.includes(` ${form} `) || (form.includes(" ") && together.length >= 5 && words.has(together));
      if (hit && (!best || form.length > best.len)) best = { s, len: form.length };
    }
  }
  return best?.s ?? null;
}

// The shopping date a search is about («black friday shein 2026» → Black Friday)
export function eventInQuery(query: string, events: readonly EventPage[] = EVENT_PAGES): EventPage | null {
  const n = normalize(query);
  return events.find((e) => e.match.test(query) || n.includes(normalize(e.name))) ?? null;
}

export interface QueryRow { query: string; page: string; clicks: number; impressions: number; position: number }

// Google shows us there but not on the first page: the searches a better page can still win
export const NEAR_MIN = 8;
export const NEAR_MAX = 30;
export const isNear = (position: number) => position >= NEAR_MIN && position <= NEAR_MAX;

export interface Opportunity {
  kind: "store-event" | "store" | "event";
  storeId?: number; slug?: string; name?: string; event?: string;
  impressions: number; clicks: number; position: number; queries: string[];
}

// The searches between 8 and 30 (Search Console, query × page) grouped by what they ask for: a store on a date
// («black friday shein»), a store («cupón esdemarca») or a date. Most seen first.
export function queryOpportunities(rows: readonly QueryRow[], stores: readonly StoreRef[], events: readonly EventPage[] = EVENT_PAGES, minImpressions = 3): Opportunity[] {
  const by = new Map<string, Opportunity & { weighted: number; seen: Set<string> }>();
  for (const r of rows) {
    if (!isNear(r.position) || r.impressions < minImpressions) continue;
    const store = storeInQuery(r.query, stores);
    const event = eventInQuery(r.query, events);
    if (!store && !event) continue;
    const kind = store && event ? "store-event" : store ? "store" : "event";
    const key = `${kind}|${store?.slug ?? ""}|${event?.slug ?? ""}`;
    const o = by.get(key) ?? { kind, storeId: store?.storeId, slug: store?.slug, name: store?.name, event: event?.slug, impressions: 0, clicks: 0, position: 0, queries: [], weighted: 0, seen: new Set<string>() };
    o.impressions += r.impressions;
    o.clicks += r.clicks;
    o.weighted += r.position * r.impressions;
    if (!o.seen.has(r.query)) {
      o.seen.add(r.query);
      o.queries.push(r.query);
    }
    by.set(key, o);
  }
  return [...by.values()]
    .map(({ weighted, seen, ...o }) => {
      void seen;
      return { ...o, position: Math.round((weighted / o.impressions) * 10) / 10 };
    })
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position);
}

// ---- which store × event pages get written

export interface CampaignStore extends StoreRef {
  country: string; category: string; live: number; clicks30: number; impressions: number;
  eventCoupons: Record<string, number>; // live coupons that name each event (by event slug)
}

export interface CampaignTarget {
  storeId: number; slug: string; name: string; event: string; year: number; date: string;
  reason: "busqueda" | "calendario"; score: number; queries: string[]; impressions: number; position: number | null;
}

// `${storeId}:${event}:${year}`: written this year already (scheduled, published or cancelled)
export const takenKey = (storeId: number, event: string, year: number) => `${storeId}:${event}:${year}`;

// A date's page for a store has to stand on something: a coupon for the date, or enough of the store's own
const eligible = (s: CampaignStore, event: string) => (s.country === "ES" || s.country === "") && ((s.eventCoupons[event] ?? 0) > 0 || s.live >= 2);

// How much a store is worth on a date: its coupons for it, what it has, what readers and Google already do with it,
// and whether it is the kind of shop the date is about. `proven` = stores that brought clicks or sales on the last
// edition of the date (the review's lesson): they go first next time.
export function calendarScore(s: CampaignStore, e: EventPage, proven = false): number {
  const forEvent = s.eventCoupons[e.slug] ?? 0;
  const fits = !e.categories.length || (e.categories as readonly string[]).includes(s.category);
  return 10 * Math.min(forEvent, 5) + Math.min(s.live, 10) + 2 * Math.min(s.clicks30, 15) + Math.min(Math.round(s.impressions / 20), 30) + (fits ? 10 : 0) + (proven ? 20 : 0);
}

export const CALENDAR_MIN_DAYS = 2;

// The searches look further ahead than the calendar: people already search «rebajas enero <tienda>» in November
const QUERY_HORIZON_DAYS = 120;

export function planCampaigns(input: {
  today: string; settings: CampaignSettings; opportunities: readonly Opportunity[]; stores: readonly CampaignStore[];
  taken: ReadonlySet<string>; events?: readonly EventPage[]; proven?: ReadonlyMap<string, ReadonlySet<string>>;
}): CampaignTarget[] {
  const events = input.events ?? EVENT_PAGES;
  const bySlug = new Map(input.stores.map((s) => [s.slug, s]));
  const out: CampaignTarget[] = [];
  const seen = new Set<string>(input.taken);
  const add = (t: CampaignTarget) => {
    const k = takenKey(t.storeId, t.event, t.year);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  // 1. what Google already shows us for, between 8 and 30
  for (const o of input.opportunities) {
    if (o.kind !== "store-event" || !o.slug || !o.event) continue;
    const s = bySlug.get(o.slug);
    const e = events.find((x) => x.slug === o.event);
    if (!s || !e || !eligible(s, e.slug)) continue;
    const ed = editionOf(e, input.today);
    if (daysFrom(input.today, ed.date) > QUERY_HORIZON_DAYS) continue;
    add({ storeId: s.storeId, slug: s.slug, name: s.name, event: e.slug, year: ed.year, date: ed.date, reason: "busqueda", score: 100 + Math.min(o.impressions, 200), queries: o.queries, impressions: o.impressions, position: o.position });
  }
  // 2. the calendar: every date coming up, its best stores, nearest date first. A date one day away is too late for a
  // page nobody searches yet to rank; the searches above still get theirs.
  for (const ed of eventsToPlan(input.today, input.settings.leadDays, events)) {
    if (daysFrom(input.today, ed.date) < CALENDAR_MIN_DAYS) continue;
    const proven = input.proven?.get(ed.event.slug);
    const ranked = input.stores
      .filter((s) => eligible(s, ed.event.slug))
      .map((s) => ({ s, score: calendarScore(s, ed.event, proven?.has(s.slug)) }))
      .sort((a, b) => b.score - a.score || a.s.slug.localeCompare(b.s.slug))
      .slice(0, input.settings.storesPerEvent);
    for (const { s, score } of ranked)
      add({ storeId: s.storeId, slug: s.slug, name: s.name, event: ed.event.slug, year: ed.year, date: ed.date, reason: "calendario", score, queries: [], impressions: s.impressions, position: null });
  }
  // searches first (most seen), then by date (nearest first) and score. A proven store (it brought clicks or sales) on a
  // date this week goes before the searches: it is where the money is.
  const provenNow = (t: CampaignTarget) => t.reason === "calendario" && !!input.proven?.get(t.event)?.has(t.slug) && daysFrom(input.today, t.date) <= URGENT_DAYS;
  return out.sort((a, b) => Number(provenNow(b)) - Number(provenNow(a)) || Number(b.reason === "busqueda") - Number(a.reason === "busqueda") || a.date.localeCompare(b.date) || b.score - a.score);
}

// ---- checks of a written store × event text

export const CAMPAIGN_MIN_WORDS = 300;
export const CAMPAIGN_MAX_WORDS = 1000;
// Texts of the same date for different stores share the date's facts; above this they read as one template
export const CAMPAIGN_MAX_SIMILARITY = 0.35;

export const campaignKeyword = (eventName: string, storeName: string) => `${eventName} ${storeName}`.toLowerCase();

// A text that names a year other than the edition's would be wrong next week or wrong already
export function wrongYears(g: StoreGuide, year: number): number[] {
  const text = [g.description, g.lead, ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.steps ?? [])]), ...g.faqs.flatMap((f) => [f.q, f.a])].join(" ");
  return [...new Set((text.match(/\b20\d\d\b/g) ?? []).map(Number))].filter((y) => y !== year && y !== year + 1 && y !== 2022);
}

// ---- new events in the networks' coupons and in the searches

export interface EmergingPattern { key: string; name: string; match: RegExp }

// Sales that are not on the calendar yet: some every year with a date the store announces (Prime Day, días sin IVA),
// some a store's own (aniversario, French Days). The last two catch names we don't know: «Semana de la Belleza»,
// «Outlet Days».
export const EMERGING: readonly EmergingPattern[] = [
  { key: "prime-day", name: "Prime Day", match: /prime\s*day|prime\s+big\s+deal|fiesta\s+de\s+ofertas\s+prime/i },
  { key: "dias-sin-iva", name: "Días sin IVA", match: /d[ií]as?\s+sin\s+iva|\bsin\s+iva\b/i },
  { key: "aniversario", name: "Aniversario", match: /\baniversario\b|\banniversary\b/i },
  { key: "halloween", name: "Halloween", match: /halloween/i },
  { key: "mitad-de-temporada", name: "Mitad de temporada", match: /mid\s*-?\s*season|mitad\s+de\s+temporada/i },
  { key: "friends-and-family", name: "Friends & Family", match: /friends\s*(&|and|y)\s*family/i },
  { key: "french-days", name: "French Days", match: /french\s+days/i },
  { key: "tecnoprecios", name: "Tecnoprecios", match: /tecnoprecios/i },
  { key: "hot-sale", name: "Hot Sale", match: /hot\s*sale/i },
  { key: "semana-santa", name: "Semana Santa", match: /semana\s+santa/i },
  { key: "dia-sin-iva-tech", name: "Tech Days", match: /tech\s+days/i },
];
// «Semana de la Belleza», «Outlet Days», «Summer Week»: capitalised names, which a coupon title uses for a campaign
const NAMED = [/\b[Ss]emana\s+(?:del?|de\s+la)\s+([A-ZÁÉÍÓÚ][\p{L}]+)/gu, /\b([A-Z][\p{L}]+)\s+(Days|Week)\b/gu, /\bD[ií]as\s+(?!sin\b)([A-ZÁÉÍÓÚ][\p{L}]+)/gu];

export interface DetectedEvent { key: string; name: string; count: number; stores: string[]; samples: string[]; fromSearch: number }

// The campaigns named in live coupons and searches that no calendar page covers, most mentioned first
export function detectEvents(items: readonly { text: string; store: string; search?: boolean }[], known: readonly EventPage[] = EVENT_PAGES): DetectedEvent[] {
  const by = new Map<string, DetectedEvent>();
  const covered = (s: string) => known.some((e) => e.match.test(s));
  const note = (key: string, name: string, it: { text: string; store: string; search?: boolean }) => {
    if (covered(name)) return;
    const d = by.get(key) ?? { key, name, count: 0, stores: [], samples: [], fromSearch: 0 };
    d.count++;
    if (it.search) d.fromSearch++;
    if (it.store && !d.stores.includes(it.store)) d.stores.push(it.store);
    if (d.samples.length < 3 && !d.samples.includes(it.text)) d.samples.push(it.text.slice(0, 120));
    by.set(key, d);
  };
  for (const it of items) {
    const found = new Set<string>();
    for (const p of EMERGING)
      if (p.match.test(it.text)) {
        found.add(p.key);
        note(p.key, p.name, it);
      }
    for (const re of NAMED)
      for (const m of it.text.matchAll(re)) {
        const name = m[0].replace(/\s+/g, " ").trim();
        const key = normalize(name).replace(/ /g, "-");
        if (found.has(key) || EMERGING.some((p) => p.match.test(name)) || /^(black|cyber)/i.test(name)) continue;
        found.add(key);
        note(key, name, it);
      }
  }
  // one coupon is noise; two mentions (or a search) is a campaign
  return [...by.values()].filter((d) => d.count >= 2 || d.fromSearch > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

// ---- the review before and after each date

export interface Totals { impressions: number; clicks: number; position: number | null }
export interface PageChange { path: string; before: Totals; after: Totals }
export interface StoreResult { slug: string; name: string; clicks: number; commissions: number; sales: number }
export interface CampaignPageInfo { slug: string; name: string; publishedAt: string | null; reason: string }

export interface EventMetrics {
  queries: Totals; // searches about the date (any page of ours)
  pages: Totals; // the date's pages (/ofertas/<evento> and /ofertas/<evento>/<tienda>)
  storeClicks: number; // clicks to stores from those pages
  siteClicks: number; // clicks to stores from anywhere
  commissions: number; sales: number; // € earned and number of sales in the window
}

export interface ReviewInput {
  event: string; name: string; year: number; date: string; ends: string;
  before: EventMetrics; during: EventMetrics; lastYear: Totals | null;
  pages: PageChange[]; stores: StoreResult[]; campaignPages: CampaignPageInfo[];
  stillNear: { query: string; position: number; impressions: number }[];
  hard: { query: string; position: number; impressions: number }[];
}

// The windows compared: the date (two weeks before to three days after it ends) and the same number of days right
// before. The review waits a week after the end: Search Console takes two or three days to fill in.
export function reviewWindows(ed: { date: string; ends: string }) {
  const during = { start: addDays(ed.date, -14), end: addDays(ed.ends, 3) };
  const len = daysFrom(during.start, during.end) + 1;
  const before = { start: addDays(during.start, -len), end: addDays(during.start, -1) };
  const lastYear = { start: addDays(during.start, -364), end: addDays(during.end, -364) };
  return { during, before, lastYear };
}
export const reviewDue = (ed: { ends: string }, today: string) => today >= addDays(ed.ends, 7);
// The «before» snapshot is taken when the date enters the plan: what we start from
export const baselineDue = (ed: { date: string }, today: string, leadDays: number) => today >= addDays(ed.date, -leadDays) && today <= ed.date;

export function totalsOf(rows: readonly { clicks: number; impressions: number; position: number }[]): Totals {
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  return { impressions, clicks, position: impressions ? Math.round((rows.reduce((n, r) => n + r.position * r.impressions, 0) / impressions) * 10) / 10 : null };
}

const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} %` : a ? "nuevo" : "=");

// What worked and what didn't, in sentences, and what the next edition does differently. Rules, not AI: every line is
// a number we measured.
export function learnings(r: ReviewInput): string[] {
  const out: string[] = [];
  const late = r.campaignPages.filter((p) => !p.publishedAt || daysFrom(p.publishedAt.slice(0, 10), r.date) < ON_TIME_DAYS);
  if (late.length)
    out.push(`${late.length} de ${r.campaignPages.length} páginas de tienda salieron con menos de ${ON_TIME_DAYS} días de margen (${late.slice(0, 5).map((p) => p.name).join(", ")}). El próximo año se escriben desde ${CAMPAIGN_DEFAULTS.leadDays} días antes.`);
  const moved = r.pages
    .filter((p) => p.before.position != null && p.after.position != null && p.after.impressions >= 10)
    .map((p) => ({ ...p, delta: (p.before.position as number) - (p.after.position as number) }));
  const up = moved.filter((p) => p.delta >= 3).sort((a, b) => b.delta - a.delta);
  const down = moved.filter((p) => p.delta <= -3).sort((a, b) => a.delta - b.delta);
  if (up.length) out.push(`Subieron: ${up.slice(0, 5).map((p) => `${p.path} (${p.before.position} → ${p.after.position})`).join(", ")}.`);
  if (down.length) out.push(`Bajaron: ${down.slice(0, 5).map((p) => `${p.path} (${p.before.position} → ${p.after.position})`).join(", ")}. Se reescriben antes de la próxima edición.`);
  const sold = r.stores.filter((s) => s.sales > 0);
  if (sold.length) out.push(`Convirtieron: ${sold.slice(0, 5).map((s) => `${s.name} (${s.sales} ${s.sales === 1 ? "venta" : "ventas"}, ${s.commissions.toFixed(2)} €)`).join(", ")}. Van primero el próximo año.`);
  const noSale = r.stores.filter((s) => s.clicks >= 5 && s.sales === 0);
  if (noSale.length) out.push(`Con clics y sin ventas: ${noSale.slice(0, 5).map((s) => `${s.name} (${s.clicks})`).join(", ")}. Revisar el enlace de afiliado y si el código funcionaba.`);
  if (r.stillNear.length) out.push(`${r.stillNear.length} búsquedas siguen entre la posición ${NEAR_MIN} y la ${NEAR_MAX} (${r.stillNear.slice(0, 4).map((q) => `«${q.query}»`).join(", ")}): se priorizan en la próxima edición.`);
  if (r.hard.length) out.push(`Muy vistas pero lejos, por detrás de la ${NEAR_MAX}: ${r.hard.slice(0, 3).map((q) => `«${q.query}» (${q.position})`).join(", ")}. Las copan webs grandes; mejor no gastar ahí.`);
  if (r.lastYear && r.lastYear.impressions && r.during.queries.impressions < r.lastYear.impressions)
    out.push(`Menos impresiones que el año pasado en las mismas fechas (${r.during.queries.impressions} frente a ${r.lastYear.impressions}).`);
  if (!out.length) out.push("Sin datos suficientes para sacar conclusiones todavía.");
  return out;
}

// The review as the admin chat reads it
export function formatReview(r: ReviewInput): string {
  const t = (x: Totals) => `${x.impressions} impresiones, ${x.clicks} clics${x.position != null ? `, posición ${x.position}` : ""}`;
  return [
    `📊 Informe de ${r.name} ${r.year} (antes y después)`,
    "",
    `Búsquedas del evento: ${t(r.during.queries)} (antes: ${t(r.before.queries)}; ${pct(r.during.queries.impressions, r.before.queries.impressions)} en impresiones)`,
    r.lastYear ? `Mismas fechas el año pasado: ${t(r.lastYear)}` : null,
    `Páginas del evento: ${t(r.during.pages)} (antes: ${t(r.before.pages)})`,
    `Clics a tiendas desde esas páginas: ${r.during.storeClicks} (antes: ${r.before.storeClicks}). En toda la web: ${r.during.siteClicks} (${pct(r.during.siteClicks, r.before.siteClicks)})`,
    `Comisiones: ${r.during.commissions.toFixed(2)} € en ${r.during.sales} ${r.during.sales === 1 ? "venta" : "ventas"} (antes: ${r.before.commissions.toFixed(2)} €)`,
    "",
    "Qué aprendemos:",
    ...learnings(r).map((l) => `• ${l}`),
  ].filter((l) => l !== null).join("\n");
}

export interface BaselineInput { event: string; name: string; year: number; date: string; queries: Totals; pages: Totals; lastYear: Totals | null; targets: string[]; near: { query: string; position: number; impressions: number }[] }

export function formatBaseline(b: BaselineInput): string {
  const t = (x: Totals) => `${x.impressions} impresiones, ${x.clicks} clics${x.position != null ? `, posición ${x.position}` : ""}`;
  return [
    `🎯 Empieza la campaña de ${b.name} ${b.year} (${b.date})`,
    "",
    `Punto de partida, últimos 28 días: búsquedas del evento ${t(b.queries)}; páginas del evento ${t(b.pages)}.`,
    b.lastYear ? `El año pasado en esas fechas: ${t(b.lastYear)}.` : null,
    b.near.length ? `Búsquedas cerca de la 1.ª página: ${b.near.slice(0, 6).map((q) => `«${q.query}» (${q.position})`).join(", ")}.` : null,
    b.targets.length ? `Tiendas que tendrán página propia: ${b.targets.slice(0, 15).join(", ")}${b.targets.length > 15 ? "…" : ""}.` : null,
    "",
    "Al terminar llegará el informe con lo que funcionó y lo que no.",
  ].filter((l) => l !== null).join("\n");
}

// ---- store guides that the searches ask for

export interface GuideState { status: "none" | "scheduled" | "published" | "rejected" | "hand"; lastWritten: string | null; live: number; pendingRewrite: boolean }
export interface GuideWork { storeId: number; slug: string; name: string; queries: string[]; impressions: number; position: number; rewrite: boolean }

// A rewrite waits this long after the last one: Google needs weeks to react to a page that changed
export const REWRITE_AFTER_DAYS = 30;
export const GUIDE_WORK_PER_RUN = 2;

// Searches between 8 and 30 that name a store («cupón esdemarca»): a store without a guide gets one (with at least two
// live coupons to stand on), and an automatic guide written a month ago or more is rewritten to answer those searches.
// Hand-written, cancelled and waiting guides are left alone.
export function guidesToImprove(opps: readonly Opportunity[], states: ReadonlyMap<string, GuideState>, today: string, limit = GUIDE_WORK_PER_RUN, minImpressions = 20): GuideWork[] {
  const out: GuideWork[] = [];
  for (const o of opps) {
    if (out.length >= limit) break;
    if (o.kind !== "store" || !o.slug || o.storeId == null || o.impressions < minImpressions) continue;
    const st = states.get(o.slug);
    if (!st || st.pendingRewrite) continue;
    const work = { storeId: o.storeId, slug: o.slug, name: o.name ?? o.slug, queries: o.queries, impressions: o.impressions, position: o.position };
    if (st.status === "none" && st.live >= 2) out.push({ ...work, rewrite: false });
    else if (st.status === "published" && st.lastWritten && daysFrom(st.lastWritten, today) >= REWRITE_AFTER_DAYS) out.push({ ...work, rewrite: true });
  }
  return out;
}

// ---- the date of the week, on the home page and on the date that just ended

// The shopping date to put in front: the next one (today included) if it is a week away or less. The day after Black
// Friday it is Cyber Monday: the site moves on by itself.
export function featuredEvent(today: string, events: readonly EventPage[] = EVENT_PAGES): Edition | null {
  return events
    .map((e) => editionOf(e, today))
    .filter((x) => x.date >= today && daysFrom(today, x.date) <= URGENT_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

export interface EventStoreLink { slug: string; name: string; n: number; written: boolean; clicks: number }

// The store pages of a date to link: stores with coupons for it, and stores with their own text for this edition (over
// live coupons). The ones readers click most go first (Samsung, the week this was written), then the most coupons.
export function eventStoreLinks(
  e: EventPage, counted: readonly { slug: string; name: string; n: number }[], written: readonly { slug: string; name: string }[],
  clicks: ReadonlyMap<string, number>, limit = 12,
): EventStoreLink[] {
  const by = new Map<string, EventStoreLink>();
  for (const s of counted) by.set(s.slug, { ...s, written: false, clicks: clicks.get(s.slug) ?? 0 });
  for (const s of written) by.set(s.slug, { slug: s.slug, name: s.name, n: by.get(s.slug)?.n ?? 0, written: true, clicks: clicks.get(s.slug) ?? 0 });
  void e;
  return [...by.values()].sort((a, b) => b.clicks - a.clicks || b.n - a.n || a.name.localeCompare(b.name, "es")).slice(0, limit);
}

// «-20 %» for a title, from the best discount on the page; "" when there is no percentage worth saying (or an absurd one)
export const titleDiscount = (best: number) => (best >= 5 && best <= 90 ? `-${Math.round(best)} %` : "");
