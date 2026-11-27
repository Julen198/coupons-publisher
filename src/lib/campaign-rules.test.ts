import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_DEFAULTS, baselineDue, calendarScore, campaignSettingsOf, delayFor, detectEvents, eventInQuery, eventsToPlan, formatReview, guidesToImprove,
  learnings, planCampaigns, queryOpportunities, reviewDue, reviewWindows, storeInQuery, takenKey, totalsOf, wrongYears,
  type CampaignStore, type GuideState, type ReviewInput,
} from "./campaign-rules.ts";
import { eventPageOf } from "./event-pages.ts";
import type { StoreGuide } from "./store-guides.ts";

const STORES = [
  { storeId: 1, slug: "shein", name: "Shein" },
  { storeId: 2, slug: "esdemarca", name: "Esdemarca" },
  { storeId: 3, slug: "atmosfera-sport", name: "Atmosfera Sport" },
  { storeId: 4, slug: "bstn", name: "BSTN" },
  { storeId: 5, slug: "pull-and-bear", name: "Pull&Bear" },
  { storeId: 6, slug: "bear", name: "Bear" },
  { storeId: 7, slug: "hm", name: "H&M" },
];

test("campaignSettingsOf reads the panel and caps the daily number", () => {
  assert.deepEqual(campaignSettingsOf({}), CAMPAIGN_DEFAULTS);
  assert.equal(campaignSettingsOf({ campaigns_per_day: "99" }).perDay, 12);
  assert.equal(campaignSettingsOf({ campaigns_enabled: "0" }).enabled, false);
  assert.equal(campaignSettingsOf({ campaigns_lead_days: "2" }).leadDays, CAMPAIGN_DEFAULTS.leadDays);
});

test("a date less than a week away publishes after 12 hours", () => {
  assert.equal(delayFor(3, CAMPAIGN_DEFAULTS), 12);
  assert.equal(delayFor(30, CAMPAIGN_DEFAULTS), 24);
  assert.equal(delayFor(3, { ...CAMPAIGN_DEFAULTS, delayHours: 4 }), 4);
});

test("storeInQuery finds the store a search names, longest name first", () => {
  assert.equal(storeInQuery("black friday shein 2026", STORES)?.slug, "shein");
  assert.equal(storeInQuery("cupón esdemarca", STORES)?.slug, "esdemarca");
  assert.equal(storeInQuery("atmósfera sport código descuento", STORES)?.slug, "atmosfera-sport");
  assert.equal(storeInQuery("atmosferasport descuento", STORES)?.slug, "atmosfera-sport");
  assert.equal(storeInQuery("codigo descuento pull and bear", STORES)?.slug, "pull-and-bear");
  assert.equal(storeInQuery("bstn sneakers", STORES)?.slug, "bstn");
  assert.equal(storeInQuery("sheinside", STORES), null); // not a whole word
  assert.equal(storeInQuery("h&m cupón", STORES)?.slug, "hm");
  assert.equal(storeInQuery("hm", STORES), null); // two letters: too short to trust
});

test("eventInQuery finds the shopping date", () => {
  assert.equal(eventInQuery("black friday shein 2026")?.slug, "black-friday");
  assert.equal(eventInQuery("cyber monday bstn")?.slug, "cyber-monday");
  assert.equal(eventInQuery("cupón esdemarca"), null);
});

test("queryOpportunities groups the searches between 8 and 30 by store and date", () => {
  const rows = [
    { query: "black friday shein 2026", page: "/ofertas/black-friday", clicks: 1, impressions: 60, position: 12 },
    { query: "shein black friday", page: "/tiendas/shein", clicks: 0, impressions: 40, position: 18 },
    { query: "cupón esdemarca", page: "/tiendas/esdemarca", clicks: 2, impressions: 80, position: 9 },
    { query: "esdemarca", page: "/tiendas/esdemarca", clicks: 9, impressions: 300, position: 4 }, // already on page 1
    { query: "shein", page: "/tiendas/shein", clicks: 0, impressions: 500, position: 55 }, // too far
    { query: "zapatillas baratas", page: "/", clicks: 0, impressions: 90, position: 15 }, // no store, no date
    { query: "cyber monday bstn", page: "/tiendas/bstn", clicks: 0, impressions: 2, position: 20 }, // too few
  ];
  const o = queryOpportunities(rows, STORES);
  assert.deepEqual(o.map((x) => [x.kind, x.slug, x.event, x.impressions]), [
    ["store-event", "shein", "black-friday", 100],
    ["store", "esdemarca", undefined, 80],
  ]);
  assert.equal(o[0].position, 14.4); // weighted by impressions
  assert.deepEqual(o[0].queries, ["black friday shein 2026", "shein black friday"]);
});

test("eventsToPlan lists the dates from leadDays before until the day itself", () => {
  const plan = eventsToPlan("2026-11-27", 42).map((e) => e.event.slug);
  assert.deepEqual(plan, ["black-friday", "cyber-monday", "navidad", "rebajas-de-enero"]);
  assert.ok(!eventsToPlan("2026-10-01", 42).some((e) => e.event.slug === "black-friday"));
});

const store = (over: Partial<CampaignStore>): CampaignStore => ({
  storeId: 1, slug: "a", name: "A", country: "ES", category: "moda", live: 5, clicks30: 0, impressions: 0, eventCoupons: {}, ...over,
});

test("planCampaigns: searches first, then each date's best stores; nothing twice, nothing already taken", () => {
  const stores = [
    store({ storeId: 1, slug: "shein", name: "Shein", live: 20 }),
    store({ storeId: 2, slug: "bstn", name: "BSTN", category: "zapatillas", eventCoupons: { "black-friday": 3 } }),
    store({ storeId: 3, slug: "tiny", name: "Tiny", live: 1 }), // too little to stand on
    store({ storeId: 4, slug: "fr", name: "FR", country: "FR", live: 30 }), // not the Spanish site
  ];
  const opportunities = [{ kind: "store-event" as const, storeId: 1, slug: "shein", name: "Shein", event: "black-friday", impressions: 100, clicks: 1, position: 14, queries: ["black friday shein"] }];
  const t = planCampaigns({ today: "2026-11-20", settings: { ...CAMPAIGN_DEFAULTS, storesPerEvent: 5 }, opportunities, stores, taken: new Set([takenKey(2, "cyber-monday", 2026)]) });
  assert.deepEqual(t[0], { storeId: 1, slug: "shein", name: "Shein", event: "black-friday", year: 2026, date: "2026-11-27", reason: "busqueda", score: 200, queries: ["black friday shein"], impressions: 100, position: 14 });
  const keys = t.map((x) => `${x.slug}:${x.event}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("bstn:black-friday"));
  assert.ok(!keys.includes("bstn:cyber-monday")); // taken this year
  assert.ok(!keys.some((k) => k.startsWith("tiny:") || k.startsWith("fr:")));
  // calendar entries by date: Black Friday before Cyber Monday before Navidad
  const cal = t.filter((x) => x.reason === "calendario").map((x) => x.date);
  assert.deepEqual(cal, [...cal].sort());
});

test("calendarScore: coupons for the date and stores that converted last time go first", () => {
  const bf = eventPageOf("black-friday")!;
  assert.ok(calendarScore(store({ eventCoupons: { "black-friday": 2 } }), bf) > calendarScore(store({}), bf));
  assert.equal(calendarScore(store({}), bf, true) - calendarScore(store({}), bf), 20);
});

const text = (over: Partial<StoreGuide> = {}): StoreGuide => ({ slug: "a", keyword: "black friday a", description: "d", lead: "l", sections: [{ heading: "h", paragraphs: ["p"] }], faqs: [], ...over });

test("wrongYears flags a year that is not the edition's", () => {
  assert.deepEqual(wrongYears(text({ lead: "Black Friday 2026 y Navidad 2027" }), 2026), []);
  assert.deepEqual(wrongYears(text({ lead: "como en el Black Friday 2025" }), 2026), [2025]);
});

test("detectEvents finds campaigns the calendar doesn't cover", () => {
  const d = detectEvents([
    { text: "Prime Day: 20 % en Echo", store: "Amazon" },
    { text: "Ofertas Prime Day en Kindle", store: "Amazon" },
    { text: "Días sin IVA en televisores", store: "MediaMarkt" },
    { text: "Black Friday: 30 %", store: "Shein" }, // on the calendar
    { text: "Semana de la Belleza: 2x1", store: "Druni" },
    { text: "Semana de la Belleza en perfumes", store: "Primor" },
    { text: "dias sin iva mediamarkt", store: "", search: true },
  ]);
  assert.deepEqual(d.map((x) => [x.key, x.count]), [["dias-sin-iva", 2], ["prime-day", 2], ["semana-de-la-belleza", 2]]);
  assert.deepEqual(d.find((x) => x.key === "semana-de-la-belleza")?.stores, ["Druni", "Primor"]);
  assert.equal(d.find((x) => x.key === "dias-sin-iva")?.fromSearch, 1);
});

test("the review compares the date with the same days right before, a week after it ends", () => {
  const w = reviewWindows({ date: "2026-11-27", ends: "2026-11-30" });
  assert.deepEqual(w.during, { start: "2026-11-13", end: "2026-12-03" });
  assert.deepEqual(w.before, { start: "2026-10-23", end: "2026-11-12" });
  assert.equal(reviewDue({ ends: "2026-11-30" }, "2026-12-06"), false);
  assert.equal(reviewDue({ ends: "2026-11-30" }, "2026-12-07"), true);
  assert.equal(baselineDue({ date: "2026-12-25" }, "2026-11-13", 42), true);
  assert.deepEqual(totalsOf([{ clicks: 1, impressions: 10, position: 10 }, { clicks: 0, impressions: 30, position: 20 }]), { impressions: 40, clicks: 1, position: 17.5 });
});

const empty = { queries: { impressions: 0, clicks: 0, position: null }, pages: { impressions: 0, clicks: 0, position: null }, storeClicks: 0, siteClicks: 0, commissions: 0, sales: 0 };
const review = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  event: "black-friday", name: "Black Friday", year: 2026, date: "2026-11-27", ends: "2026-11-30", before: empty, during: empty, lastYear: null,
  pages: [], stores: [], campaignPages: [], stillNear: [], hard: [], ...over,
});

test("learnings say what came late, what moved and what converted", () => {
  const l = learnings(review({
    campaignPages: [{ slug: "shein", name: "Shein", publishedAt: "2026-11-25T10:00:00Z", reason: "busqueda" }, { slug: "bstn", name: "BSTN", publishedAt: "2026-10-20T10:00:00Z", reason: "calendario" }],
    pages: [
      { path: "/ofertas/black-friday/bstn", before: { impressions: 30, clicks: 0, position: 25 }, after: { impressions: 200, clicks: 9, position: 7 } },
      { path: "/ofertas/black-friday/x", before: { impressions: 30, clicks: 0, position: 10 }, after: { impressions: 50, clicks: 0, position: 19 } },
    ],
    stores: [{ slug: "samsung", name: "Samsung", clicks: 12, commissions: 95, sales: 1 }, { slug: "shein", name: "Shein", clicks: 8, commissions: 0, sales: 0 }],
    stillNear: [{ query: "black friday esdemarca", position: 14, impressions: 40 }],
  }));
  assert.match(l[0], /1 de 2 páginas.*Shein/);
  assert.ok(l.some((x) => /Subieron: \/ofertas\/black-friday\/bstn \(25 → 7\)/.test(x)));
  assert.ok(l.some((x) => /Bajaron: \/ofertas\/black-friday\/x/.test(x)));
  assert.ok(l.some((x) => /Convirtieron: Samsung \(1 venta, 95.00 €\)/.test(x)));
  assert.ok(l.some((x) => /Con clics y sin ventas: Shein \(8\)/.test(x)));
  assert.ok(l.some((x) => /«black friday esdemarca»/.test(x)));
  assert.match(formatReview(review()), /^📊 Informe de Black Friday 2026/);
  assert.deepEqual(learnings(review()), ["Sin datos suficientes para sacar conclusiones todavía."]);
});

test("guidesToImprove: a store search writes a missing guide or rewrites an old automatic one", () => {
  const opp = (slug: string, impressions = 50) => ({ kind: "store" as const, storeId: 1, slug, name: slug, impressions, clicks: 0, position: 12, queries: [`cupón ${slug}`] });
  const st = (over: Partial<GuideState>): GuideState => ({ status: "none", lastWritten: null, live: 5, pendingRewrite: false, ...over });
  const states = new Map<string, GuideState>([
    ["nueva", st({})],
    ["vieja", st({ status: "published", lastWritten: "2026-10-01" })],
    ["reciente", st({ status: "published", lastWritten: "2026-11-20" })],
    ["mano", st({ status: "hand" })],
    ["vacia", st({ live: 1 })],
  ]);
  const w = guidesToImprove(["nueva", "vieja", "reciente", "mano", "vacia"].map((s) => opp(s)), states, "2026-11-27", 5);
  assert.deepEqual(w.map((x) => [x.slug, x.rewrite]), [["nueva", false], ["vieja", true]]);
  assert.equal(guidesToImprove([opp("nueva", 5)], states, "2026-11-27").length, 0); // too few impressions
});
