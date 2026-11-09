// The automatic store guides, end to end (design: docs/superpowers/specs/2026-11-09-auto-store-guides-design.md).
// Daily cron: publish the guides whose wait is over, pick today's stores, write and check their guides, schedule
// them, tell the admin chat. People only step in to cancel (/panel/guias).
import { sql } from "./db";
import { generateStoreGuide } from "./ai-guide";
import { GUIDE_DEFAULTS, guideProblems, guideSimilarity, MAX_SIMILARITY, pickCandidates, settingsOf, type Candidate, type GuideSettings, type StoreSignals } from "./guide-rules.ts";
import { siteCoupons, siteStore, type SiteCoupon } from "./public-site";
import { siteUrl } from "./site-text";
import { guideSlugs, storeGuide, type StoreGuide } from "./store-guides.ts";
import { tg, telegramConfig } from "./telegram";
import { categoryOf } from "./catalog";

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

// Every store on the public site with its live coupons, codes and last-30-day clicks
export async function storeSignals(coupons?: SiteCoupon[]): Promise<StoreSignals[]> {
  const [live, stores, clicks] = await Promise.all([
    coupons ?? siteCoupons(),
    sql()<{ id: number; slug: string; name: string; country: string }[]>`SELECT id, slug, name, country FROM stores`,
    sql()<{ store_id: number; n: number }[]>`SELECT store_id, count(*)::int AS n FROM clicks WHERE at > now() - interval '30 days' GROUP BY store_id`,
  ]);
  const clicksOf = new Map(clicks.map((c) => [c.store_id, c.n]));
  return stores.map((s) => {
    const mine = live.filter((c) => c.store_id === s.id);
    return { storeId: s.id, slug: s.slug, name: s.name, country: s.country, live: mine.length, codes: mine.filter((c) => c.kind === "code" && c.code).length, clicks30: clicksOf.get(s.id) ?? 0 };
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
  const fresh = await sql()<{ name: string }[]>`
    UPDATE store_guides g SET status = 'published', published_at = now() FROM stores s
    WHERE s.id = g.store_id AND g.status = 'scheduled' AND g.publish_at <= now() RETURNING s.name`;
  const rewritten = await sql()<{ name: string }[]>`
    UPDATE store_guides g SET content = g.draft, draft = NULL, published_at = now(), rewritten_at = now() FROM stores s
    WHERE s.id = g.store_id AND g.status = 'published' AND g.draft IS NOT NULL AND g.publish_at <= now() RETURNING s.name`;
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
    await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: [...lines, "", `Revisar o cancelar: ${siteUrl()}/panel/guias`].join("\n"), disable_web_page_preview: true });
  } catch (e) {
    console.error("guides telegram notice failed", e); // the guide is scheduled anyway; the panel shows it
  }
}

export interface CronResult { published: string[]; scheduled: { name: string; publishAt: Date }[]; failed: { name: string; problems: string[] }[]; skipped?: string }

// Stop starting new stores after this, so the run (and its notices) ends inside the route's maxDuration of 300 s
const TIME_BUDGET_MS = 200_000;

export async function runGuidesCron(started = Date.now()): Promise<CronResult> {
  const settings = await guideSettings();
  const published = await publishDue();
  await notify(published.map((n) => `✅ Publicada la guía de ${n}.`));
  const result: CronResult = { published, scheduled: [], failed: [] };
  if (!settings.enabled) return { ...result, skipped: "desactivado en el panel" };
  const room = settings.perDay - (await writtenToday());
  if (room <= 0) return result;
  const coupons = await siteCoupons();
  const [signals, taken] = await Promise.all([storeSignals(coupons), takenSlugs()]);
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
  return result;
}
