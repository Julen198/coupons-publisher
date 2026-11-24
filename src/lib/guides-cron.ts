// The automatic store guides, end to end (design: docs/superpowers/specs/2026-11-09-auto-store-guides-design.md).
// Daily cron: publish the guides whose wait is over, pick today's stores, write and check their guides, schedule
// them, tell the admin chat. People only step in to cancel (/panel/guias).
import { sql, type Coupon, type Store } from "./db";
import { generateStoreGuide } from "./ai-guide";
import { GUIDE_DEFAULTS, nearFirstPage, guideProblems, guideSimilarity, lasts, MAX_SIMILARITY, pickCandidates, settingsOf, type Candidate, type GuideSettings, type StoreSignals } from "./guide-rules.ts";
import { NEAR_PAGES_KEY, siteCoupons, siteStore, type SiteCoupon } from "./public-site";
import { madridToday } from "./site-text";
import { appUrl } from "./email";
import { guideSlugs, storeGuide, type StoreGuide } from "./store-guides.ts";
import { tg, telegramConfig } from "./telegram";
import { categoryOf, missingFacts } from "./catalog";
import { pingIndexNow } from "./guide-index";
import { faqsToText, generateStoreContent } from "./ai-content";
import { assertWithinBudget } from "./ai-budget";
import { dateRange, googleConfigured, meanPosition, searchAnalytics, storeSlugOf, type SearchRow } from "./google-api.ts";

// status: scheduled (new, goes out at publish_at), published, rejected (cancelled, or the AI couldn't write a valid
// one). A rewrite of a published guide waits in `draft` until publish_at, so the live one stays on the page meanwhile.
export type GuideStatus = "scheduled" | "published" | "rejected";
export type GuideSignals = Partial<Candidate> & { problems?: string[] };
export interface GuideRow {
  store_id: number; slug: string; name: string; status: GuideStatus; content: StoreGuide; draft: StoreGuide | null;
  signals: GuideSignals; publish_at: Date; published_at: Date | null; created_at: Date;
}

export async function guideSettings(): Promise<GuideSettings> {
  const rows = await sql()<{ key: string; value: string }[]>`SELECT key, value FROM settings WHERE key LIKE 'guides\_%'`;
  return rows.length ? settingsOf(Object.fromEntries(rows.map((r) => [r.key, r.value]))) : GUIDE_DEFAULTS;
}

export async function guideRows(): Promise<GuideRow[]> {
  const rows = await sql()<GuideRow[]>`
    SELECT g.store_id, s.slug, s.name, g.status, g.content, g.draft, g.signals, g.publish_at, g.published_at, g.created_at
    FROM store_guides g JOIN stores s ON s.id = g.store_id ORDER BY g.publish_at DESC`;
  return rows.map((r) => ({ ...r }));
}

// Search Console rows per store page, last 28 days; empty without credentials or when Google fails (the cron goes on)
async function searchByStore(): Promise<Map<string, SearchRow[]>> {
  const out = new Map<string, SearchRow[]>();
  if (!googleConfigured()) return out;
  try {
    const r = dateRange(28);
    for (const row of await searchAnalytics(r.start, r.end, ["page"], 1000)) {
      const slug = storeSlugOf(row.keys[0]);
      if (slug) out.set(slug, [...(out.get(slug) ?? []), row]);
    }
  } catch (e) {
    console.error("guides: Search Console read failed", e);
  }
  return out;
}

// Every store on the public site with its live coupons, codes, last-30-day clicks and Google impressions
export async function storeSignals(coupons?: SiteCoupon[]): Promise<StoreSignals[]> {
  const [live, stores, clicks, search] = await Promise.all([
    coupons ?? siteCoupons(),
    sql()<{ id: number; slug: string; name: string; country: string }[]>`SELECT id, slug, name, country FROM stores`,
    sql()<{ store_id: number; n: number }[]>`SELECT store_id, count(*)::int AS n FROM clicks WHERE at > now() - interval '30 days' GROUP BY store_id`,
    searchByStore(),
  ]);
  const clicksOf = new Map(clicks.map((c) => [c.store_id, c.n]));
  const today = madridToday().iso;
  return stores.map((s) => {
    const mine = live.filter((c) => c.store_id === s.id);
    const codes = mine.filter((c) => c.kind === "code" && c.code);
    const deals = mine.filter((c) => !(c.kind === "code" && c.code));
    const rows = search.get(s.slug) ?? [];
    return {
      storeId: s.id, slug: s.slug, name: s.name, country: s.country, live: mine.length,
      codes: codes.length, lastingCodes: codes.filter((c) => lasts(c.expires_at, today)).length,
      deals: deals.length, lastingDeals: deals.filter((c) => lasts(c.expires_at, today)).length,
      clicks30: clicksOf.get(s.id) ?? 0, impressions: rows.reduce((n, r) => n + r.impressions, 0), position: meanPosition(rows),
    };
  });
}

// Stores never proposed again by the cron: hand-written guides and any row (scheduled, published or rejected)
async function takenSlugs(): Promise<Set<string>> {
  const rows = await sql()<{ slug: string }[]>`SELECT s.slug FROM store_guides g JOIN stores s ON s.id = g.store_id`;
  return new Set([...guideSlugs(), ...rows.map((r) => r.slug)]);
}

export async function nextCandidates(limit = 10): Promise<Candidate[]> {
  const [signals, taken, settings] = await Promise.all([storeSignals(), takenSlugs(), guideSettings()]);
  return pickCandidates(signals, { minLive: settings.minLive, taken }).slice(0, limit);
}

async function otherGuides(slug: string): Promise<StoreGuide[]> {
  const rows = await sql()<{ content: StoreGuide }[]>`SELECT content FROM store_guides WHERE status <> 'rejected'`;
  return [...guideSlugs().map((s) => storeGuide(s)!), ...rows.map((r) => r.content)].filter((g) => g.slug !== slug);
}

export type WriteResult = { guide: StoreGuide; problems: string[] } | { guide: null; problems: string[] };

// Writes the guide of one store and checks it (two tries). problems = [] means it can be scheduled.
export async function writeGuide(slug: string, coupons?: SiteCoupon[]): Promise<WriteResult> {
  const store = await siteStore(slug);
  if (!store) return { guide: null, problems: ["la tienda no está en la web"] };
  const mine = (coupons ?? (await siteCoupons())).filter((c) => c.store_id === store.id);
  const others = await otherGuides(slug);
  const input = {
    slug, name: store.name, website: store.website, category: categoryOf(store.category)?.label ?? "", facts: store.facts, intro: store.intro,
    keyword: `código descuento ${store.name}`,
    coupons: mine.map((c) => ({ kind: c.kind, title: c.display_title, discount: c.discount, description: c.description, expires_at: c.expires_at })),
  };
  const codes = mine.map((c) => c.code).filter(Boolean);
  let last: WriteResult = { guide: null, problems: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const guide = await generateStoreGuide({ ...input, fix: last.problems });
    const problems = guideProblems(guide, { facts: store.facts, codes });
    const twin = others.find((o) => guideSimilarity(guide, o) > MAX_SIMILARITY);
    if (twin) problems.push(`se parece demasiado a la guía de ${twin.slug}`);
    last = { guide, problems };
    if (!problems.length) break;
  }
  return last;
}

// A new guide, or a rewrite. A published guide keeps showing: the rewrite waits in draft until publish_at.
export async function scheduleGuide(storeId: number, guide: StoreGuide, signals: GuideSignals, delayHours: number): Promise<Date> {
  const g = sql().json(guide as never);
  const sg = sql().json(signals as never);
  const [row] = await sql()<{ publish_at: Date }[]>`
    INSERT INTO store_guides (store_id, status, content, signals, publish_at)
    VALUES (${storeId}, 'scheduled', ${g}, ${sg}, now() + make_interval(hours => ${delayHours}))
    ON CONFLICT (store_id) DO UPDATE SET
      signals = EXCLUDED.signals, publish_at = EXCLUDED.publish_at,
      draft = CASE WHEN store_guides.status = 'published' THEN EXCLUDED.content ELSE NULL END,
      content = CASE WHEN store_guides.status = 'published' THEN store_guides.content ELSE EXCLUDED.content END,
      status = CASE WHEN store_guides.status = 'published' THEN 'published' ELSE 'scheduled' END
    RETURNING publish_at`;
  return row.publish_at;
}

// The AI couldn't write a valid guide: keep its last try as rejected so the store isn't retried (and billed) every
// day; "Reescribir" in the panel tries again
async function recordFailure(storeId: number, guide: StoreGuide, signals: GuideSignals): Promise<void> {
  await sql()`
    INSERT INTO store_guides (store_id, status, content, signals, publish_at)
    VALUES (${storeId}, 'rejected', ${sql().json(guide as never)}, ${sql().json(signals as never)}, now())
    ON CONFLICT (store_id) DO NOTHING`;
}

async function publishDue(): Promise<string[]> {
  const fresh = await sql()<{ name: string; slug: string }[]>`
    UPDATE store_guides g SET status = 'published', published_at = now() FROM stores s
    WHERE s.id = g.store_id AND g.status = 'scheduled' AND g.publish_at <= now() RETURNING s.name, s.slug`;
  const rewritten = await sql()<{ name: string; slug: string }[]>`
    UPDATE store_guides g SET content = g.draft, draft = NULL, published_at = now(), rewritten_at = now() FROM stores s
    WHERE s.id = g.store_id AND g.status = 'published' AND g.draft IS NOT NULL AND g.publish_at <= now() RETURNING s.name, s.slug`;
  // the new guide's page, and the home page and /llms.txt that now link to it
  if (fresh.length || rewritten.length) await pingIndexNow([...[...fresh, ...rewritten].map((r) => `/tiendas/${r.slug}`), "/", "/llms.txt"]);
  return [...fresh.map((r) => r.name), ...rewritten.map((r) => `${r.name} (reescrita)`)];
}

// Rows written today (Madrid), failures included: the per-day cap
async function writtenToday(): Promise<number> {
  const [row] = await sql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM store_guides WHERE (created_at AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date`;
  return row?.n ?? 0;
}

const fmtWhen = (d: Date) => d.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

async function notify(lines: string[]) {
  const cfg = telegramConfig();
  if (!cfg || !lines.length) return;
  try {
    await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: [...lines, "", `Revisar o cancelar: ${appUrl()}/panel/guias`].join("\n"), disable_web_page_preview: true });
  } catch (e) {
    console.error("guides telegram notice failed", e); // the guide is scheduled anyway; the panel shows it
  }
}

export interface CronResult { published: string[]; scheduled: { name: string; publishAt: Date }[]; failed: { name: string; problems: string[] }[]; intros?: string[]; skipped?: string }

// Stores with live coupons but no intro get one (and FAQs if they have none) each day, busiest first: a store page that
// is only a list of coupons reads as thin content. Short texts from the store's own coupons (generateStoreContent);
// they can be edited in the store's panel page.
const INTROS_PER_DAY = 5;

async function fillStoreIntros(coupons: SiteCoupon[], started: number): Promise<string[]> {
  const live = new Map<number, number>();
  for (const c of coupons) live.set(c.store_id, (live.get(c.store_id) ?? 0) + 1);
  if (!live.size) return [];
  // a store with a guide (or one on its way) is left alone: its page shows the guide's lead where the intro would go
  const [rows, guided] = await Promise.all([
    sql()<Store[]>`SELECT * FROM stores WHERE id = ANY(${[...live.keys()]}) AND intro = ''`,
    sql()<{ slug: string }[]>`SELECT s.slug FROM store_guides g JOIN stores s ON s.id = g.store_id WHERE g.status IN ('scheduled', 'published')`,
  ]);
  const skip = new Set([...guideSlugs(), ...guided.map((g) => g.slug)]);
  const stores = rows.filter((st) => !skip.has(st.slug));
  const done: string[] = [];
  for (const store of [...stores].sort((a, b) => (live.get(b.id) ?? 0) - (live.get(a.id) ?? 0)).slice(0, INTROS_PER_DAY)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      await assertWithinBudget();
      const own = await sql()<Coupon[]>`SELECT * FROM coupons WHERE store_id = ${store.id} AND archived = 0 ORDER BY id DESC LIMIT 40`;
      const out = await generateStoreContent({ ...store }, [...own]);
      if (!out.intro.trim()) continue;
      // only fills what is empty: an intro or FAQs someone wrote by hand meanwhile stay
      await sql()`
        UPDATE stores SET intro = CASE WHEN intro = '' THEN ${out.intro.trim()} ELSE intro END,
                          faqs = CASE WHEN faqs = '' THEN ${faqsToText(out.faqs)} ELSE faqs END
        WHERE id = ${store.id}`;
      done.push(store.name);
    } catch (e) {
      console.error("store intro failed", store.slug, e);
      break; // over budget or the AI is down: try again tomorrow
    }
  }
  return done;
}

// Stop starting new stores after this, so the run (and its notices) ends inside the route's maxDuration of 300 s
const TIME_BUDGET_MS = 200_000;

export async function runGuidesCron(started = Date.now()): Promise<CronResult> {
  const settings = await guideSettings();
  const published = await publishDue();
  await notify(published.map((n) => `✅ Publicada la guía de ${n}.`));
  const result: CronResult = { published, scheduled: [], failed: [] };
  if (!settings.enabled) return { ...result, skipped: "desactivado en el panel" };
  const coupons = await siteCoupons();
  const signals = await storeSignals(coupons);
  await saveNearFirstPage(signals);
  const room = settings.perDay - (await writtenToday());
  if (room > 0) await writeTodaysGuides(coupons, signals, settings, room, result, started);
  result.intros = await fillStoreIntros(coupons, started);
  if (result.intros.length) await notify([`✍️ Texto de presentación escrito para ${result.intros.join(", ")}. Puedes editarlo en la ficha de cada tienda.`]);
  return result;
}

// The store pages near Google's first page, for the internal links (see nearFirstPageStores). Without Search Console
// data the last saved list stays.
async function saveNearFirstPage(signals: StoreSignals[]) {
  if (!signals.some((s) => (s.impressions ?? 0) > 0)) return;
  try {
    await sql()`INSERT INTO settings (key, value) VALUES (${NEAR_PAGES_KEY}, ${JSON.stringify(nearFirstPage(signals))}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  } catch (e) {
    console.error("guides: near-first-page list not saved", e);
  }
}

async function writeTodaysGuides(coupons: SiteCoupon[], signals: StoreSignals[], settings: GuideSettings, room: number, result: CronResult, started: number) {
  const taken = await takenSlugs();
  // ponytail: no lock; Vercel fires this cron once a day, and a rare overlap only rewrites the same store twice
  for (const c of pickCandidates(signals, { minLive: settings.minLive, taken }).slice(0, room)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const out = await writeGuide(c.slug, coupons);
      if (out.guide && !out.problems.length) {
        const publishAt = await scheduleGuide(c.storeId, out.guide, c, settings.delayHours);
        result.scheduled.push({ name: c.name, publishAt });
        await notify([`📝 Guía de ${c.name} lista. Se publica el ${fmtWhen(publishAt)}.`]);
        continue;
      }
      if (out.guide) await recordFailure(c.storeId, out.guide, { ...c, problems: out.problems });
      result.failed.push({ name: c.name, problems: out.problems });
    } catch (e) {
      console.error("guide write failed", c.slug, e);
      result.failed.push({ name: c.name, problems: [e instanceof Error ? e.message : "error al escribir"] });
    }
    const f = result.failed.at(-1)!;
    await notify([`⚠️ No se pudo escribir la guía de ${f.name}: ${f.problems.join("; ")}. En el panel puedes pulsar «Reescribir».`]);
  }
}

// The stores with the most live coupons whose page still lacks key facts (envío, devoluciones…), for /panel/guias
export async function storesMissingFacts(limit = 15): Promise<{ slug: string; name: string; live: number; missing: string[] }[]> {
  const coupons = await siteCoupons();
  const live = new Map<number, number>();
  for (const c of coupons) live.set(c.store_id, (live.get(c.store_id) ?? 0) + 1);
  if (!live.size) return [];
  const rows = await sql()<{ id: number; slug: string; name: string; facts: string }[]>`SELECT id, slug, name, facts FROM stores WHERE id = ANY(${[...live.keys()]})`;
  return rows
    .map((r) => ({ slug: r.slug, name: r.name, live: live.get(r.id) ?? 0, missing: missingFacts(r.facts) }))
    .sort((a, b) => b.live - a.live || a.name.localeCompare(b.name, "es"))
    .slice(0, limit)
    .filter((r) => r.missing.length);
}
