import { test } from "node:test";
import assert from "node:assert/strict";
import { dealFaqs, offerConditions } from "./deal-page.ts";

const facts = [
  { label: "Financiación", value: "Sin intereses desde 90 €" },
  { label: "Devoluciones", value: "30 días" },
  { label: "Envío a España", value: "Gratis desde 50 €" },
  { label: "Códigos por pedido", value: "1" },
];

test("offerConditions follows the board's rows and folds in the store facts", () => {
  const rows = offerConditions({ badge: "15 %", wordBadge: false, code: "CLAB15", expiresAt: "2026-11-12", conds: ["Solo primer pedido", "No válido en lanzamientos"], facts });
  assert.deepEqual(rows, [
    ["Descuento", "15 % con el código CLAB15"],
    ["Válido hasta", "12 de noviembre de 2026"],
    ["Envío a España", "Gratis desde 50 €"],
    ["Devoluciones", "30 días"],
    ["Códigos por pedido", "1"],
    ["Financiación", "Sin intereses desde 90 €"],
    ["Otras condiciones", "Solo primer pedido · No válido en lanzamientos"],
  ]);
});

test("offerConditions leaves out rows it has no data for", () => {
  assert.deepEqual(offerConditions({ badge: "Oferta", wordBadge: true, code: "", expiresAt: null, conds: [], facts: [] }), [
    ["Descuento", "Oferta sin código"],
    ["Válido hasta", "Sin fecha de caducidad anunciada"],
  ]);
  assert.deepEqual(offerConditions({ badge: "20 %", wordBadge: false, code: "", expiresAt: "2026-12-01", conds: [], facts: [] })[0], ["Descuento", "20 %, sin código"]);
  assert.equal(offerConditions({ badge: "20 %", wordBadge: false, code: "", expiresAt: "2026-12-01", conds: [], facts: [] })[1][1], "1 de diciembre de 2026 o hasta agotar existencias");
});

test("dealFaqs for a live code: until when, combining codes with the store's rule, where to paste it", () => {
  const faqs = dealFaqs({ store: "43einhalb", code: "CLAB15", expiresAt: "2026-11-12", live: true, codesPerOrder: "1" });
  assert.deepEqual(faqs.map((f) => f.q), ["¿Hasta cuándo vale este código?", "¿Puedo usar CLAB15 junto con otro código?", "¿Dónde pego el código CLAB15?"]);
  assert.match(faqs[0].a, /^Hasta el 12 de noviembre de 2026\./);
  assert.equal(faqs[1].a, "No. 43einhalb admite un solo código por pedido.");
  assert.match(faqs[2].a, /carrito de 43einhalb/);
});

test("dealFaqs without the store's rule says what most stores do", () => {
  const faqs = dealFaqs({ store: "Zalando", code: "X", expiresAt: null, live: true, codesPerOrder: "" });
  assert.match(faqs[0].a, /no ha anunciado fecha de caducidad/);
  assert.match(faqs[1].a, /^Casi nunca\./);
  assert.match(dealFaqs({ store: "Zalando", code: "X", expiresAt: null, live: true, codesPerOrder: "2" })[1].a, /hasta 2 códigos por pedido/);
});

test("dealFaqs for an offer without code, and for an expired deal", () => {
  const offer = dealFaqs({ store: "Dyson", code: "", expiresAt: "2026-12-01", live: true, codesPerOrder: "" });
  assert.deepEqual(offer.map((f) => f.q), ["¿Hasta cuándo vale esta oferta?", "¿Hace falta un código para esta oferta?"]);
  assert.match(offer[0].a, /o hasta que se agoten las existencias/);
  const gone = dealFaqs({ store: "Dyson", code: "", expiresAt: "2026-10-01", live: false, codesPerOrder: "" });
  assert.equal(gone.length, 1);
  assert.match(gone[0].a, /^No\. Caducó el 1 de octubre de 2026\./);
});
