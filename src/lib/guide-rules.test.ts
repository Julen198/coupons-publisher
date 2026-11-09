import { test } from "node:test";
import assert from "node:assert/strict";
import { guideProblems, guideSimilarity, guideWords, pickCandidates, scoreOf, settingsOf, type StoreSignals } from "./guide-rules.ts";
import type { StoreGuide } from "./store-guides.ts";

const guide = (over: Partial<StoreGuide> = {}): StoreGuide => ({
  slug: "kiwoko",
  keyword: "código descuento Kiwoko",
  description: "Código descuento Kiwoko comprobado hoy.",
  lead: "Si buscas un código descuento Kiwoko, aquí tienes los que funcionan hoy para tu mascota.",
  sections: [{ heading: "Qué descuentos tiene Kiwoko", paragraphs: ["palabra ".repeat(600).trim()] }],
  faqs: [{ q: "¿Funciona hoy?", a: "Sí, los de arriba están comprobados." }],
  ...over,
});

// A store as storeSignals builds it: live = every live coupon; codes / deals split it; lasting* = those still valid in 14
// days (or with no end date)
const signals = (over: Partial<StoreSignals>): StoreSignals => ({
  storeId: 1, slug: "a", name: "A", country: "ES", live: 8, codes: 5, lastingCodes: 5, deals: 3, lastingDeals: 3, clicks30: 0, ...over,
});
const slugs = (all: StoreSignals[], taken: string[] = []) => pickCandidates(all, { minLive: 5, taken: new Set(taken) }).map((c) => c.slug);

test("settingsOf reads the panel settings and falls back to the defaults", () => {
  assert.deepEqual(settingsOf({}), { minLive: 5, perDay: 2, delayHours: 48, enabled: true });
  assert.deepEqual(settingsOf({ guides_min_live: "3", guides_per_day: "1", guides_delay_hours: "24", guides_enabled: "0" }), { minLive: 3, perDay: 1, delayHours: 24, enabled: false });
  assert.deepEqual(settingsOf({ guides_min_live: "-2", guides_per_day: "abc" }), { minLive: 5, perDay: 2, delayHours: 48, enabled: true });
  assert.equal(settingsOf({ guides_per_day: "50" }).perDay, 5); // never a flood, whatever is typed
});

// ---- who can get a guide

test("eligibility: Spanish market, enough live coupons, no guide yet", () => {
  assert.deepEqual(slugs([signals({ slug: "es" }), signals({ slug: "blank", country: "" }), signals({ slug: "it", country: "IT" })]), ["blank", "es"]);
  assert.deepEqual(slugs([signals({ slug: "few", live: 4 })]), []);
  assert.deepEqual(slugs([signals({ slug: "done" })], ["done"]), []);
});

test("eligibility: the guide answers «código descuento <tienda>», so a store with no live code never gets one", () => {
  // El Corte Inglés today: 23 offers, 0 codes
  assert.deepEqual(slugs([signals({ slug: "eci", live: 23, codes: 0, lastingCodes: 0, deals: 23, lastingDeals: 1 })]), []);
});

test("eligibility: the page must still have content in two weeks", () => {
  // Alltricks today: 5 codes, all ending within 14 days
  assert.deepEqual(slugs([signals({ slug: "alltricks", live: 5, codes: 5, lastingCodes: 0, deals: 0, lastingDeals: 0 })]), []);
  assert.deepEqual(slugs([signals({ slug: "one-left", live: 6, codes: 6, lastingCodes: 1, deals: 0, lastingDeals: 0 })]), []);
  assert.deepEqual(slugs([signals({ slug: "two-left", live: 6, codes: 6, lastingCodes: 1, deals: 0, lastingDeals: 1 })]), ["two-left"]);
});

// ---- how they rank

test("score: codes that last weigh most; short-lived codes and offers add a little, all capped", () => {
  const base = { codes: 0, lastingCodes: 0, deals: 0, lastingDeals: 0 };
  assert.equal(scoreOf(signals({ ...base, codes: 1, lastingCodes: 1 })), 5);
  assert.equal(scoreOf(signals({ ...base, codes: 20, lastingCodes: 20 })), 25); // 5 lasting codes are the cap
  assert.equal(scoreOf(signals({ ...base, codes: 4, lastingCodes: 0 })), 6); // short-lived: 2 each, max 3 of them
  assert.equal(scoreOf(signals({ ...base, deals: 40, lastingDeals: 40 })), 8); // offers: 1 each, max 8
  assert.equal(scoreOf(signals({ ...base, deals: 24, lastingDeals: 0 })), 0); // offers about to end: nothing
});

test("score: a niche store with lasting codes beats a big catalogue of offers", () => {
  const niche = signals({ slug: "niche", live: 7, codes: 7, lastingCodes: 5, deals: 0, lastingDeals: 0 });
  const catalogue = signals({ slug: "catalogue", live: 60, codes: 1, lastingCodes: 1, deals: 59, lastingDeals: 59 });
  assert.ok(scoreOf(niche) > scoreOf(catalogue));
  assert.deepEqual(slugs([catalogue, niche]), ["niche", "catalogue"]);
});

test("score: readers' clicks show real demand, capped so one busy page can't take every slot", () => {
  const base = signals({});
  assert.equal(scoreOf({ ...base, clicks30: 4 }) - scoreOf(base), 8);
  assert.equal(scoreOf({ ...base, clicks30: 500 }) - scoreOf(base), 30);
});

test("score: Search Console rewards pages in reach and holds back pages stuck far down", () => {
  const base = signals({});
  const plus = (over: Partial<StoreSignals>) => scoreOf({ ...base, ...over }) - scoreOf(base);
  assert.equal(plus({ impressions: 400, position: 45 }), 20 - 20); // 400/20, but stuck past 40 with real impressions
  assert.equal(plus({ impressions: 60, position: 45 }), 3); // too few impressions to judge the position
  assert.equal(plus({ impressions: 400, position: 14 }), 20 + 15); // in reach (8–30): the best bet for a guide
  assert.equal(plus({ impressions: 10, position: 14 }), 1); // a handful of impressions is no signal yet
  assert.equal(plus({ impressions: 5000, position: 3 }), 40); // impressions capped; already top: no extra push
  assert.equal(plus({ impressions: 0, position: null }), 0);
});

test("real data, 9 Nov 2026: the stores eligible today and their order", () => {
  // live, codes, lasting codes, offers, lasting offers per store (Spanish site, tracked links), from the database
  const today = [
    signals({ slug: "miravia", live: 7, codes: 7, lastingCodes: 1, deals: 0, lastingDeals: 0 }),
    signals({ slug: "aosom", live: 7, codes: 7, lastingCodes: 5, deals: 0, lastingDeals: 0 }),
    signals({ slug: "alltricks", live: 5, codes: 5, lastingCodes: 0, deals: 0, lastingDeals: 0 }),
    signals({ slug: "samsung", live: 27, codes: 3, lastingCodes: 3, deals: 24, lastingDeals: 0 }),
    signals({ slug: "honor", live: 4, codes: 3, lastingCodes: 1, deals: 1, lastingDeals: 0 }),
    signals({ slug: "myprotein", live: 23, codes: 1, lastingCodes: 1, deals: 22, lastingDeals: 21 }),
    signals({ slug: "atmosfera-sport", live: 16, codes: 1, lastingCodes: 1, deals: 15, lastingDeals: 15 }),
    signals({ slug: "el-corte-ingles", live: 23, codes: 0, lastingCodes: 0, deals: 23, lastingDeals: 1 }),
    signals({ slug: "pccomponentes", live: 10, codes: 0, lastingCodes: 0, deals: 10, lastingDeals: 7 }),
    signals({ slug: "nike", live: 6, codes: 0, lastingCodes: 0, deals: 6, lastingDeals: 6 }),
  ];
  const picked = pickCandidates(today, { minLive: 5, taken: new Set(["atmosfera-sport"]) });
  assert.deepEqual(picked.map((c) => [c.slug, c.score]), [["aosom", 29], ["samsung", 15], ["myprotein", 13]]);
});

test("guideWords counts the words of every text in the guide", () => {
  const g = guide({ lead: "uno dos", sections: [{ heading: "tres", paragraphs: ["cuatro cinco"], steps: ["seis"] }], faqs: [{ q: "siete", a: "ocho nueve" }] });
  assert.equal(guideWords(g), 9);
});

test("guideProblems passes a guide that follows the rules", () => {
  assert.deepEqual(guideProblems(guide(), { facts: "", codes: [] }), []);
});

test("guideProblems flags length, missing keyword, invented policies and codes", () => {
  assert.match(guideProblems(guide({ sections: [] }), { facts: "", codes: [] }).join(), /corta/);
  assert.match(guideProblems(guide({ lead: "Ofertas de mascotas." }), { facts: "", codes: [] }).join(), /keyword/);
  const shipping = guide({ faqs: [{ q: "¿Envío?", a: "El envío gratis es a partir de 49 €." }] });
  assert.match(guideProblems(shipping, { facts: "", codes: [] }).join(), /envío/);
  assert.deepEqual(guideProblems(shipping, { facts: "Envío gratis desde 49 €", codes: [] }), []); // stated in the facts: fine
  const code = guide({ faqs: [{ q: "¿Código?", a: "Usa MASCOTA20 en el carrito." }] });
  assert.match(guideProblems(code, { facts: "", codes: ["KIWI10"] }).join(), /MASCOTA20/);
  assert.deepEqual(guideProblems(code, { facts: "", codes: ["mascota20"] }), []);
});

test("guideSimilarity is 1 for the same text, low for different stores' guides", () => {
  const only = (lead: string, text: string) => guide({ lead, faqs: [], sections: [{ heading: "x", paragraphs: [text] }] });
  const a = only("pienso de kiwoko", "el pienso para perros y gatos de kiwoko se compra con entrega a casa y recogida en tienda los fines de semana");
  const b = only("zapatillas de atmosfera", "las zapatillas de running de atmosfera sport tienen outlet por marca y deporte con descuentos de temporada");
  assert.equal(guideSimilarity(a, a), 1);
  assert.ok(guideSimilarity(a, b) < 0.2);
});

test("lasts: no end date, or still valid 14 days from today", async () => {
  const { lasts } = await import("./guide-rules.ts");
  assert.equal(lasts("", "2026-11-09"), true);
  assert.equal(lasts("2026-11-23", "2026-11-09"), true); // exactly 14 days
  assert.equal(lasts("2026-11-22", "2026-11-09"), false);
  assert.equal(lasts("2027-01-03", "2026-12-20"), true); // across months and years
  assert.equal(lasts("2027-01-02", "2026-12-20"), false);
});
