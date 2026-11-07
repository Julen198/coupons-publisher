import assert from "node:assert/strict";
import { test } from "node:test";
import { ABOUT_TIME_BUDGET_MS, aboutOutOfTime, aboutParagraphs, aboutSnippet, cleanAbout, dealAboutInput, draftsDoneMessage, pickAboutCandidates, tidyDraft } from "./deal-about.ts";

const coupon = {
  title: "WORTEN: HASTA 30% EN TELES",
  kind: "code" as const,
  code: "TELE30",
  discount: "-30 %",
  description: "Pedido mínimo 300 €. No válido en reacondicionados. Fuente: https://example.com",
  expires_at: "2026-12-31",
};
const store = {
  name: "Worten",
  facts: "Envío | Gratis desde 50 €\nDevoluciones | 30 días",
  intro: "Tienda de electrónica y electrodomésticos.",
};

test("dealAboutInput lists only the facts the model may use", () => {
  const input = dealAboutInput(coupon, store);
  assert.match(input, /^Tienda: Worten$/m);
  assert.match(input, /^Título: Hasta 30% en teles$/m);
  assert.match(input, /^Descuento: 30 %$/m);
  assert.match(input, /^Hace falta código: sí$/m);
  assert.match(input, /^Condiciones: Pedido mínimo 300 €; No válido en reacondicionados$/m);
  assert.match(input, /^Válido hasta: 31 de diciembre de 2026$/m);
  assert.match(input, /^- Envío: Gratis desde 50 €$/m);
  assert.match(input, /^- Devoluciones: 30 días$/m);
  assert.match(input, /^Sobre la tienda: Tienda de electrónica y electrodomésticos\.$/m);
  // the code itself and editor notes stay out
  assert.doesNotMatch(input, /TELE30|https?:/);
});

test("dealAboutInput says plainly what is missing", () => {
  const input = dealAboutInput({ ...coupon, kind: "deal", code: "", discount: "", description: "", expires_at: "" }, { name: "Worten", facts: "", intro: "" });
  assert.match(input, /^Descuento: sin cifra$/m);
  assert.match(input, /^Hace falta código: no$/m);
  assert.match(input, /^Condiciones: ninguna indicada$/m);
  assert.match(input, /^Válido hasta: sin fecha de caducidad anunciada$/m);
  assert.doesNotMatch(input, /Datos de la tienda|Sobre la tienda/);
});

test("cleanAbout trims, normalises line breaks and enforces 200 to 1200 chars", () => {
  const p = "a".repeat(150);
  assert.equal(cleanAbout(`  ${p}\r\n\r\n\r\n${p}  `), `${p}\n\n${p}`);
  assert.equal(cleanAbout("a".repeat(199)), null);
  assert.equal(cleanAbout(` ${"a".repeat(200)} `), "a".repeat(200));
  assert.equal(cleanAbout("a".repeat(1200)), "a".repeat(1200));
  assert.equal(cleanAbout("a".repeat(1201)), null);
});

test("aboutParagraphs splits on blank lines", () => {
  assert.deepEqual(aboutParagraphs("Uno.\n\nDos\ncon salto.\n\n\n"), ["Uno.", "Dos con salto."]);
});

test("aboutSnippet cuts at a word near 150 chars", () => {
  assert.equal(aboutSnippet("Corto.\n\nSegundo."), "Corto. Segundo.");
  const long = `${"palabra ".repeat(30)}`.trim();
  const s = aboutSnippet(long);
  assert.ok(s.length <= 151, `${s.length}`);
  assert.ok(s.endsWith("…"));
  assert.ok(!s.includes("palabra…") || s.endsWith("palabra…"));
});

test("tidyDraft drops em dashes and joins paragraphs", () => {
  assert.equal(tidyDraft([" Uno — dos. ", "Tres—cuatro."]), "Uno, dos.\n\nTres, cuatro.");
});

test("pickAboutCandidates: no text yet, most voted then newest", () => {
  const rows = [
    { id: 1, score: 0, about_status: "" as const },
    { id: 2, score: 5, about_status: "approved" as const },
    { id: 3, score: 2, about_status: "" as const },
    { id: 4, score: 0, about_status: "draft" as const },
    { id: 5, score: 0, about_status: "" as const },
  ];
  assert.deepEqual(pickAboutCandidates(rows, 2).map((r) => r.id), [3, 5]);
  assert.deepEqual(pickAboutCandidates(rows, 10).map((r) => r.id), [3, 5, 1]);
});

test("aboutOutOfTime stops the batch before the function limit", () => {
  assert.equal(aboutOutOfTime(0, ABOUT_TIME_BUDGET_MS - 1), false);
  assert.equal(aboutOutOfTime(0, ABOUT_TIME_BUDGET_MS), true);
  assert.equal(ABOUT_TIME_BUDGET_MS < 300_000, true);
});

test("draftsDoneMessage", () => {
  assert.equal(draftsDoneMessage(3, false), "3 borrador(es) creados.");
  assert.equal(draftsDoneMessage(0, false), "No quedan chollos activos sin texto.");
  assert.equal(draftsDoneMessage(4, true), "4 borrador(es) creados. Se ha parado por tiempo, pulsa otra vez para seguir.");
  assert.equal(draftsDoneMessage(0, true), "0 borrador(es) creados. Se ha parado por tiempo, pulsa otra vez para seguir.");
});
