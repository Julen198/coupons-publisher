import { test } from "node:test";
import assert from "node:assert/strict";
import { blackFriday, dealPath, longDate, parseDealId, percentOf, slugify, upcomingEvents } from "./site-text.ts";

test("slugify drops accents and symbols", () => {
  assert.equal(slugify("El Corte Inglés: 15% en Moda"), "el-corte-ingles-15-en-moda");
  assert.equal(slugify("¡¡ !!"), "");
});

test("deal paths lead with the id and parse back", () => {
  const path = dealPath({ id: 42, title: "15% extra con CLAB15", store_name: "43einhalb" });
  assert.equal(path, "/chollos/42-43einhalb-15-extra-con-clab15");
  assert.equal(parseDealId("42-43einhalb-15-extra-con-clab15"), 42);
  assert.equal(parseDealId("42"), 42);
  assert.equal(parseDealId("abc"), null);
  assert.equal(parseDealId("0-x"), null);
});

test("Black Friday is the day after the fourth Thursday of November", () => {
  assert.equal(blackFriday(2026), "2026-11-27");
  assert.equal(blackFriday(2025), "2025-11-28");
  assert.equal(blackFriday(2027), "2027-11-26");
});

test("upcoming events start today and roll into next year", () => {
  const next = upcomingEvents("2026-11-05");
  assert.deepEqual(next.map((e) => e.date), ["2026-11-11", "2026-11-27", "2026-11-30"]);
  assert.equal(upcomingEvents("2026-12-15", 1)[0].date, "2027-01-07");
});

test("percentOf reads the figure of a discount", () => {
  assert.equal(percentOf("15% de descuento"), 15);
  assert.equal(percentOf("Hasta 70% en rebajas"), 70);
  assert.equal(percentOf("10€ de descuento"), 0);
});

test("longDate writes Spanish dates", () => {
  assert.equal(longDate("2026-11-05"), "5 de noviembre de 2026");
});
