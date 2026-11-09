import { test } from "node:test";
import assert from "node:assert/strict";
import { guideProblems, guideSimilarity, guideWords, pickCandidates, settingsOf, type StoreSignals } from "./guide-rules.ts";
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

const signals = (over: Partial<StoreSignals>): StoreSignals => ({ storeId: 1, slug: "a", name: "A", country: "ES", live: 5, codes: 0, clicks30: 0, ...over });

test("settingsOf reads the panel settings and falls back to the defaults", () => {
  assert.deepEqual(settingsOf({}), { minLive: 5, perDay: 2, delayHours: 48, enabled: true });
  assert.deepEqual(settingsOf({ guides_min_live: "3", guides_per_day: "1", guides_delay_hours: "24", guides_enabled: "0" }), { minLive: 3, perDay: 1, delayHours: 24, enabled: false });
  assert.deepEqual(settingsOf({ guides_min_live: "-2", guides_per_day: "abc" }), { minLive: 5, perDay: 2, delayHours: 48, enabled: true });
  assert.equal(settingsOf({ guides_per_day: "50" }).perDay, 5); // never a flood, whatever is typed
});

test("pickCandidates keeps Spanish stores over the threshold without a guide, best score first", () => {
  const all = [
    signals({ storeId: 1, slug: "few", live: 4 }),
    signals({ storeId: 2, slug: "it", country: "IT", live: 30 }),
    signals({ storeId: 3, slug: "done", live: 20 }),
    signals({ storeId: 4, slug: "codes", live: 5, codes: 5 }), // 5 + 15 = 20
    signals({ storeId: 5, slug: "clicks", live: 6, clicks30: 10 }), // 6 + 20 = 26
    signals({ storeId: 6, slug: "blank-country", country: "", live: 8 }), // 8
  ];
  const picked = pickCandidates(all, { minLive: 5, taken: new Set(["done"]) });
  assert.deepEqual(picked.map((c) => c.slug), ["clicks", "codes", "blank-country"]);
  assert.deepEqual(picked.map((c) => c.score), [26, 20, 8]);
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
