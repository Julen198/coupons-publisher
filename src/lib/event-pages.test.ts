import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENT_PAGES, eventCouponsByStore, eventDeals, eventEdition, eventPageOf, inSeason, storeEventIndexable, storeEventPath, storeEventSeason, storeEventsInSeason } from "./event-pages.ts";
import { eventsOf } from "./site-text.ts";

const deal = (title: string, store_category = "", description = "") => ({ title, description, store_category });

test("every event page is in the calendar, and every calendar date with a page has one", () => {
  for (const e of EVENT_PAGES) assert.ok(eventsOf(2027).some((x) => x.name === e.calendarName(2027)), e.slug);
  for (const x of eventsOf(2027)) if (x.page) assert.ok(eventPageOf(x.page), x.page);
  assert.equal(new Set(EVENT_PAGES.map((e) => e.slug)).size, EVENT_PAGES.length);
});

test("eventEdition: this year's until it is over, then next year's", () => {
  const bf = eventPageOf("black-friday")!;
  assert.deepEqual(eventEdition(bf, "2026-11-16"), { year: 2026, date: "2026-11-27", ends: "2026-11-30" });
  assert.equal(eventEdition(bf, "2026-11-30").year, 2026);
  assert.equal(eventEdition(bf, "2026-12-01").year, 2027);
  // Navidad lasts until Reyes, across the new year
  const xmas = eventPageOf("navidad")!;
  assert.equal(eventEdition(xmas, "2027-01-04").date, "2026-12-25");
  assert.equal(eventEdition(xmas, "2027-01-07").date, "2027-12-25");
});

test("eventDeals: deals that name the event; while there are none, its categories", () => {
  const bf = eventPageOf("black-friday")!;
  const live = [deal("Black Friday: 30% en todo"), deal("Envío gratis", "moda", "Solo durante la Black Week"), deal("10% en zapatillas", "zapatillas")];
  assert.equal(eventDeals(bf, live, "2026-11-16").matched.length, 2);
  const cyber = eventPageOf("cyber-monday")!;
  const none = eventDeals(cyber, [deal("Portátil rebajado", "tecnologia"), deal("Vestido", "moda")], "2026-11-16");
  assert.deepEqual(none.matched, []);
  assert.deepEqual(none.fallback.map((d) => d.title), ["Portátil rebajado"]);
});

test("eventDeals: a word used all year («rebajas») only counts in season", () => {
  const sales = eventPageOf("rebajas-de-enero")!;
  const live = [deal("Rebajas de hasta el 50%", "moda")];
  assert.equal(inSeason(sales, "2026-11-16"), false);
  assert.equal(eventDeals(sales, live, "2026-11-16").matched.length, 0);
  assert.equal(eventDeals(sales, live, "2027-01-10").matched.length, 1);
});

test("store × event pages: in season from six weeks before until the event ends", () => {
  const bf = eventPageOf("black-friday")!;
  assert.equal(storeEventPath("black-friday", "myprotein"), "/ofertas/black-friday/myprotein");
  assert.equal(storeEventSeason(bf, "2026-10-12"), false);
  assert.equal(storeEventSeason(bf, "2026-10-13"), true);
  assert.equal(storeEventSeason(bf, "2026-11-30"), true);
  assert.equal(storeEventSeason(bf, "2026-12-01"), false);
  // mid-November: Black Friday first, then Cyber Monday (both close), nothing far away
  const now = storeEventsInSeason("2026-11-16").map((e) => e.slug);
  assert.deepEqual(now.slice(0, 2), ["black-friday", "cyber-monday"]);
  assert.ok(!now.includes("rebajas-de-verano"));
  assert.equal(storeEventIndexable(0), false);
  assert.equal(storeEventIndexable(3), true);
});

test("eventCouponsByStore: per store, only its coupons that name the event (standing offers left out)", () => {
  const bf = eventPageOf("black-friday")!;
  const c = (store: string, title: string, perk: string | null = null) => ({ ...deal(title, "deporte"), store_slug: store, store_name: store.toUpperCase(), perk });
  const live = [
    c("myprotein", "Black Friday Impact Bundle"),
    c("myprotein", "Black Friday Clear Bundle"),
    c("myprotein", "15 € por cada amigo"),
    c("myprotein", "Envío gratis en Black Friday", "envio"),
    c("honor", "10% descuento"),
    c("adidas", "Black Friday Membership Early Access"),
  ];
  assert.deepEqual(eventCouponsByStore(bf, live, "2026-11-16"), [
    { slug: "myprotein", name: "MYPROTEIN", n: 2 },
    { slug: "adidas", name: "ADIDAS", n: 1 },
  ]);
  // Honor has coupons but none for Cyber Monday: no page in the sitemap, and noindex
  assert.deepEqual(eventCouponsByStore(eventPageOf("cyber-monday")!, live, "2026-11-16"), []);
});
