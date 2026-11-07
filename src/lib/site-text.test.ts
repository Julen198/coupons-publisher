import { test } from "node:test";
import assert from "node:assert/strict";
import { blackFriday, calendarGroups, contactEmail, untilLabel, copiedMessage, mothersDay, dealPath, longDate, parseDealId, percentOf, savingOf, shortDate, slugify, upcomingEvents } from "./site-text.ts";

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
  assert.equal(upcomingEvents("2026-12-26", 1)[0].date, "2027-01-06");
});

test("percentOf reads the figure of a discount", () => {
  assert.equal(percentOf("15% de descuento"), 15);
  assert.equal(percentOf("Hasta 70% en rebajas"), 70);
  assert.equal(percentOf("10€ de descuento"), 0);
});

test("longDate writes Spanish dates", () => {
  assert.equal(longDate("2026-11-05"), "5 de noviembre de 2026");
});

test("Día de la Madre is the first Sunday of May", () => {
  assert.equal(mothersDay(2026), "2026-05-03");
  assert.equal(mothersDay(2027), "2027-05-02");
});

test("contactEmail is the trimmed env address, or empty when unset or not an email", () => {
  assert.equal(contactEmail(" hola@cuponlab.es "), "hola@cuponlab.es");
  assert.equal(contactEmail(""), "");
  assert.equal(contactEmail(undefined), "");
  assert.equal(contactEmail("no es un email"), "");
});

test("percentOf reads normalised badges and minus signs too", () => {
  assert.equal(percentOf("60 %"), 60);
  assert.equal(percentOf("-17%"), 17);
  assert.equal(percentOf("Hasta 83 %"), 83);
});

test("savingOf ranks an upper bound below the same flat figure", () => {
  assert.ok(savingOf("90%") > savingOf("Hasta 90%"));
  assert.ok(savingOf("75 %") > savingOf("Hasta 90 %"));
  assert.ok(savingOf("Hasta 90 %") > savingOf("40 %"));
  assert.equal(savingOf("10€"), 0);
});

test("shortDate writes the day and the short month, as the cards show it", () => {
  assert.equal(shortDate("2026-11-09"), "9 nov");
  assert.equal(shortDate("2027-01-31"), "31 ene");
  assert.equal(shortDate(""), "");
});

test("copiedMessage tells the reader where to paste the code", () => {
  assert.equal(copiedMessage("CLAB15"), "Código CLAB15 copiado. Pégalo en el carrito.");
});

test("calendarGroups gives this year's dates a group per month and later years one group each", () => {
  const ev = (date: string) => ({ date, name: date, note: "" });
  const groups = calendarGroups([ev("2026-11-11"), ev("2026-11-27"), ev("2026-12-25"), ev("2027-01-06"), ev("2027-07-01")], "2026-11-07");
  assert.deepEqual(groups.map((g) => [g.label, g.events.length]), [["Noviembre", 2], ["Diciembre", 1], ["2027", 2]]);
  assert.deepEqual(calendarGroups([], "2026-11-07"), []);
});

test("untilLabel says how far a date is", () => {
  assert.equal(untilLabel(0), "hoy");
  assert.equal(untilLabel(1), "mañana");
  assert.equal(untilLabel(22), "en 22 días");
});
